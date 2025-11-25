import ipaddress
import json
import logging
import os
from dotenv import load_dotenv
from typing import Dict, Tuple

from cassandra.connection import DefaultEndPoint, DefaultEndPointFactory
from cassandra.policies import AddressTranslator

logger = logging.getLogger(__name__)

load_dotenv()

DEFAULT_PROXY_HOST = os.getenv("SCYLLA_PROXY_DEFAULT_HOST")
_default_proxy_port_raw = os.getenv("SCYLLA_PROXY_DEFAULT_PORT")
try:
    DEFAULT_PROXY_PORT = int(_default_proxy_port_raw) if _default_proxy_port_raw else None
except ValueError:
    logger.warning(
        "Invalid SCYLLA_PROXY_DEFAULT_PORT value '%s'; ignoring the override.",
        _default_proxy_port_raw,
    )
    DEFAULT_PROXY_PORT = None

# Default proxy mapping for development
# This should be overridden via SCYLLA_PROXY_MAPPING environment variable in production
DEFAULT_DEV_PROXY_MAPPING: Dict[str, Tuple[str, int]] = {
    "172.27.0.2": ("localhost", 9037),
    "172.27.0.3": ("localhost", 9038),
    "172.27.0.5": ("localhost", 9039),
}


def _normalize_address(address: str) -> str:
    """
    Normalize inet addresses so dictionary lookups work regardless of
    whether values come in as strings or ipaddress objects.
    """
    try:
        return str(ipaddress.ip_address(str(address)))
    except ValueError:
        return str(address)


def _parse_mapping_value(value) -> Tuple[str, int]:
    if isinstance(value, (list, tuple)) and len(value) == 2:
        host, port = value
    elif isinstance(value, str):
        parts = value.split(":")
        if len(parts) != 2:
            raise ValueError(f"Invalid proxy mapping value '{value}'")
        host, port = parts[0], parts[1]
    else:
        raise TypeError(f"Unsupported proxy mapping value type: {type(value)}")
    return str(host), int(port)


def _load_proxy_mapping() -> Dict[str, Tuple[str, int]]:
    raw = os.getenv("SCYLLA_PROXY_MAPPING")
    if not raw:
        return DEFAULT_DEV_PROXY_MAPPING
    try:
        parsed = json.loads(raw)
        mapping = {
            _normalize_address(key): _parse_mapping_value(value)
            for key, value in parsed.items()
        }
        return mapping
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to parse SCYLLA_PROXY_MAPPING (%s); falling back to defaults.", exc)
        return DEFAULT_DEV_PROXY_MAPPING


DEV_PROXY_MAPPING: Dict[str, Tuple[str, int]] = _load_proxy_mapping()
_contact_points = {value for value in DEV_PROXY_MAPPING.values()}
if DEFAULT_PROXY_HOST and DEFAULT_PROXY_PORT:
    _contact_points.add((DEFAULT_PROXY_HOST, DEFAULT_PROXY_PORT))
DEV_PROXY_CONTACT_POINTS = sorted(
    _contact_points,
    key=lambda item: (item[0], item[1]),
)


class ProxyAddressTranslator(AddressTranslator):
    """
    Translates the internal Scylla node addresses to the reachable proxy host.
    """

    def __init__(self, mapping: Dict[str, Tuple[str, int]]):
        self._mapping = {
            _normalize_address(key): (value[0], value[1]) for key, value in mapping.items()
        }

    def translate(self, address):
        normalized = _normalize_address(address)
        mapped_host, _ = self._mapping.get(normalized, (None, None))
        if mapped_host:
            return mapped_host
        if DEFAULT_PROXY_HOST:
            return DEFAULT_PROXY_HOST
        return normalized


class ProxyEndPointFactory(DefaultEndPointFactory):
    """
    EndPointFactory that rewrites both address and port so that the driver
    connects through the remote nginx TCP proxies instead of the private network.
    """

    def __init__(self, mapping: Dict[str, Tuple[str, int]], default_port: int | None = None):
        super().__init__(port=default_port)
        normalized_mapping = {
            _normalize_address(key): (value[0], value[1]) for key, value in mapping.items()
        }
        endpoint_counts: Dict[Tuple[str, int], int] = {}
        for endpoint in normalized_mapping.values():
            endpoint_counts[endpoint] = endpoint_counts.get(endpoint, 0) + 1
        duplicates = [endpoint for endpoint, count in endpoint_counts.items() if count > 1]
        if duplicates:
            logger.warning(
                "Multiple Scylla peers resolve to the same proxy endpoint(s) %s. "
                "Consider adding additional proxy ports to avoid dropped connections.",
                duplicates,
            )
        self._mapping = normalized_mapping

    def create(self, row):
        from cassandra.metadata import _NodeInfo  # Imported lazily to avoid heavy import up front

        addr = _NodeInfo.get_broadcast_rpc_address(row)
        port = _NodeInfo.get_broadcast_rpc_port(row)

        normalized = _normalize_address(addr)
        mapped_host, mapped_port = self._mapping.get(normalized, (None, None))
        # Fallback to default proxy host/port if provided
        if mapped_host is None and DEFAULT_PROXY_HOST:
            mapped_host = DEFAULT_PROXY_HOST
            if DEFAULT_PROXY_PORT:
                mapped_port = DEFAULT_PROXY_PORT

        # Fallback to defaults if metadata does not provide a port.
        if port is None:
            port = self.port if self.port else 9042

        if mapped_port:
            port = mapped_port

        # Always prefer explicit mapping/default; only fall back to translator if needed
        translated_host = mapped_host or DEFAULT_PROXY_HOST or self.cluster.address_translator.translate(addr)

        # Debug trace to help diagnose connectivity issues
        try:
            logger.debug(
                "ProxyEndPointFactory.create: addr=%s normalized=%s -> %s:%s (mapped_port=%s)",
                addr,
                normalized,
                translated_host,
                port,
                mapped_port,
            )
        except Exception:
            pass

        return DefaultEndPoint(translated_host, port)
