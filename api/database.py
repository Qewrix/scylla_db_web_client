import logging
import os
from typing import Optional

from cassandra.cluster import Cluster, Session
from cassandra.policies import TokenAwarePolicy, RoundRobinPolicy
from dotenv import load_dotenv

from scylla_proxy import (
    DEV_PROXY_CONTACT_POINTS,
    DEV_PROXY_MAPPING,
    ProxyAddressTranslator,
    ProxyEndPointFactory,
)

load_dotenv()

logger = logging.getLogger(__name__)

# Global session instance
_cluster: Optional[Cluster] = None
_session: Optional[Session] = None


def get_session() -> Session:
    """
    Returns a singleton ScyllaDB session.
    Connection parameters are read from environment variables.
    Supports both direct connection and proxy-based connection.
    """
    global _cluster, _session

    if _session is not None:
        return _session

    # Read environment configuration
    env = os.getenv("ENVIRONMENT", "dev")
    connect_timeout = float(os.getenv("SCYLLA_CONNECT_TIMEOUT", "10.0"))

    logger.info(f"Connecting to ScyllaDB (environment: {env})")

    # Configure based on environment
    if env == "dev":
        # Use proxy configuration for dev
        contact_points = DEV_PROXY_CONTACT_POINTS
        proxy_mapping = DEV_PROXY_MAPPING
        logger.info(f"Using dev proxy contact points: {contact_points}")
    else:
        # Direct connection for production - load from .env, no fallbacks
        scylla_host = os.getenv("SCYLLA_HOST")
        scylla_port = os.getenv("SCYLLA_PORT")
        scylla_contact_points = os.getenv("SCYLLA_CONTACT_POINTS")

        if scylla_contact_points:
            # Parse comma-separated list of host:port pairs
            # Format: "host1:port1,host2:port2,host3:port3"
            contact_points = []
            for cp in scylla_contact_points.split(","):
                cp = cp.strip()
                if ":" in cp:
                    host, port = cp.rsplit(":", 1)
                    contact_points.append((host, int(port)))
                else:
                    contact_points.append(
                        (cp, int(scylla_port) if scylla_port else 9042)
                    )
        elif scylla_host and scylla_port:
            contact_points = [(scylla_host, int(scylla_port))]
        else:
            raise RuntimeError(
                "SCYLLA_HOST and SCYLLA_PORT (or SCYLLA_CONTACT_POINTS) must be set in .env for production"
            )

        proxy_mapping = None
        logger.info(f"Using direct connection, will try: {contact_points}")

    # Try each contact point
    for host, port in contact_points:
        try:
            logger.info(f"Attempting connection to {host}:{port}")
            cluster_kwargs = {
                "contact_points": [host],
                "port": port,
                "load_balancing_policy": TokenAwarePolicy(RoundRobinPolicy()),
                "connect_timeout": connect_timeout,
                "control_connection_timeout": connect_timeout,
            }

            # Add proxy configuration if in dev mode
            if proxy_mapping is not None:
                cluster_kwargs["address_translator"] = ProxyAddressTranslator(
                    proxy_mapping
                )
                cluster_kwargs["endpoint_factory"] = ProxyEndPointFactory(
                    proxy_mapping, default_port=port
                )

            _cluster = Cluster(**cluster_kwargs)
            _session = _cluster.connect()
            logger.info(f"Successfully connected to ScyllaDB via {host}:{port}")
            break
        except Exception as e:
            logger.warning(f"Failed to connect via {host}:{port}: {e}")
            continue

    if _session is None:
        raise RuntimeError(
            "Unable to connect to ScyllaDB with the configured contact points"
        )

    return _session


def close_session():
    """Close the ScyllaDB session and cluster."""
    global _cluster, _session
    if _session:
        _session.shutdown()
        _session = None
    if _cluster:
        _cluster.shutdown()
        _cluster = None
    logger.info("ScyllaDB session closed")
