"""initial schema with PostGIS

Revision ID: 0001_initial
Revises:
Create Date: 2026-04-20

Crea el schema completo de la v1.

Sobre los ENUM: SQLAlchemy auto-crea el tipo la primera vez que aparece
en una columna durante `op.create_table`, y lo reutiliza en tablas
siguientes. Por eso basta con definir cada enum una vez a nivel módulo
y referenciarlo en los `sa.Column`. Nada de SQL manual ni DO blocks.
"""

from typing import Sequence, Union

import geoalchemy2
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Cada enum instanciado UNA vez: SQLAlchemy trackea si ya lo creó y
# emite `CREATE TYPE` solo la primera vez que lo ve en una tabla.
USER_ROLE = sa.Enum("citizen", "staff", "admin", name="user_role")
REPORT_TYPE = sa.Enum(
    "bloqueo_vial", "sendero_obstruido", "inundacion_local",
    "deslizamiento_local", "riesgo_electrico", "refugio_saturado",
    "refugio_cerrado",
    name="report_type",
)
SEVERITY = sa.Enum("leve", "moderada", "grave", name="severity")
HAZARD_CATEGORY = sa.Enum("Baja", "Media", "Alta", name="hazard_category")
EMERGENCY_TYPE = sa.Enum(
    "inundacion", "movimiento_en_masa", "avenida_torrencial",
    name="emergency_type",
)
MEMBER_STATUS = sa.Enum(
    "safe", "evacuating", "help", "unknown", name="member_status"
)
MISSING_STATUS = sa.Enum("active", "found", "closed", name="missing_status")
INSTITUTION_TYPE = sa.Enum(
    "SALUD", "SEGURIDAD", "CULTO", "EDUCACION", name="institution_type"
)


def upgrade() -> None:
    # Extensión PostGIS — necesaria antes de cualquier columna Geometry.
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    # Tablas en orden de dependencia. SQLAlchemy emite CREATE TYPE
    # automáticamente la primera vez que cada enum aparece en un
    # sa.Column, y lo reutiliza en tablas posteriores.
    op.create_table(
        "municipios",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("slug", sa.String(64), nullable=False, unique=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column(
            "bbox",
            geoalchemy2.Geometry(geometry_type="POLYGON", srid=4326),
            nullable=True,
        ),
        sa.Column("active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            nullable=False, server_default=sa.func.now(),
        ),
    )

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("firebase_uid", sa.String(128), nullable=False, unique=True),
        sa.Column("email", sa.String(320), nullable=True),
        sa.Column("display_name", sa.String(200), nullable=True),
        sa.Column("photo_url", sa.Text, nullable=True),
        sa.Column("legacy_device_id", sa.String(64), nullable=True),
        sa.Column(
            "role", USER_ROLE, nullable=False, server_default="citizen",
        ),
        sa.Column(
            "municipio_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("municipios.id"), nullable=True,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            nullable=False, server_default=sa.func.now(),
        ),
        sa.Column(
            "last_seen_at", sa.DateTime(timezone=True),
            nullable=False, server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_users_firebase_uid", "users", ["firebase_uid"])

    op.create_table(
        "citizen_reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "municipio_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("municipios.id"), nullable=False,
        ),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"), nullable=True,
        ),
        sa.Column("device_id", sa.String(64), nullable=True),
        sa.Column("type", REPORT_TYPE, nullable=False),
        sa.Column("severity", SEVERITY, nullable=True),
        sa.Column("note", sa.Text, nullable=True),
        sa.Column("photo_url", sa.Text, nullable=True),
        sa.Column(
            "location",
            geoalchemy2.Geometry(geometry_type="POINT", srid=4326),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            nullable=False, server_default=sa.func.now(),
        ),
        sa.Column("expired_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_citizen_reports_municipio", "citizen_reports", ["municipio_id"])
    op.create_index("ix_citizen_reports_device", "citizen_reports", ["device_id"])
    op.execute(
        "CREATE INDEX ix_citizen_reports_location_gist "
        "ON citizen_reports USING GIST (location)"
    )

    op.create_table(
        "public_alerts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "municipio_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("municipios.id"), nullable=False,
        ),
        sa.Column("type", REPORT_TYPE, nullable=False),
        sa.Column(
            "centroid",
            geoalchemy2.Geometry(geometry_type="POINT", srid=4326),
            nullable=False,
        ),
        sa.Column("radius_m", sa.Integer, nullable=False, server_default="30"),
        sa.Column("aggregated_severity", SEVERITY, nullable=True),
        sa.Column("support_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("unique_device_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("sample_photo_url", sa.Text, nullable=True),
        sa.Column("first_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "computed_at", sa.DateTime(timezone=True),
            nullable=False, server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_public_alerts_municipio", "public_alerts", ["municipio_id"])
    op.execute(
        "CREATE INDEX ix_public_alerts_centroid_gist "
        "ON public_alerts USING GIST (centroid)"
    )

    op.create_table(
        "missing_persons",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "municipio_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("municipios.id"), nullable=False,
        ),
        sa.Column(
            "reporter_user_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"), nullable=True,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("photo_url", sa.Text, nullable=True),
        sa.Column(
            "last_seen",
            geoalchemy2.Geometry(geometry_type="POINT", srid=4326),
            nullable=False,
        ),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "status", MISSING_STATUS, nullable=False, server_default="active",
        ),
        sa.Column("contact_info", sa.Text, nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            nullable=False, server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True),
            nullable=False, server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_missing_persons_municipio", "missing_persons", ["municipio_id"])
    op.execute(
        "CREATE INDEX ix_missing_persons_last_seen_gist "
        "ON missing_persons USING GIST (last_seen)"
    )

    op.create_table(
        "family_groups",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(8), nullable=False, unique=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column(
            "municipio_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("municipios.id"), nullable=True,
        ),
        sa.Column(
            "created_by_user_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"), nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            nullable=False, server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_family_groups_code", "family_groups", ["code"])

    op.create_table(
        "group_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "group_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("family_groups.id"), nullable=False,
        ),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"), nullable=False,
        ),
        sa.Column("display_name", sa.String(200), nullable=True),
        sa.Column(
            "last_location",
            geoalchemy2.Geometry(geometry_type="POINT", srid=4326),
            nullable=True,
        ),
        sa.Column(
            "last_status", MEMBER_STATUS,
            nullable=False, server_default="unknown",
        ),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "joined_at", sa.DateTime(timezone=True),
            nullable=False, server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("group_id", "user_id", name="uq_group_member"),
    )
    op.create_index("ix_group_members_group", "group_members", ["group_id"])
    op.create_index("ix_group_members_user", "group_members", ["user_id"])

    op.create_table(
        "shelters",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "municipio_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("municipios.id"), nullable=False,
        ),
        sa.Column("external_ref", sa.String(64), nullable=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column(
            "location",
            geoalchemy2.Geometry(geometry_type="POINT", srid=4326),
            nullable=False,
        ),
        sa.Column("capacity", sa.Integer, nullable=True),
        sa.Column(
            "amenities", postgresql.JSONB, nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            nullable=False, server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_shelters_municipio", "shelters", ["municipio_id"])
    op.execute(
        "CREATE INDEX ix_shelters_location_gist "
        "ON shelters USING GIST (location)"
    )

    op.create_table(
        "institutions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "municipio_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("municipios.id"), nullable=False,
        ),
        sa.Column("external_ref", sa.String(64), nullable=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("type", INSTITUTION_TYPE, nullable=False),
        sa.Column(
            "location",
            geoalchemy2.Geometry(geometry_type="POINT", srid=4326),
            nullable=False,
        ),
        sa.Column("phone", sa.String(32), nullable=True),
        sa.Column("address", sa.Text, nullable=True),
    )
    op.create_index("ix_institutions_municipio", "institutions", ["municipio_id"])
    op.execute(
        "CREATE INDEX ix_institutions_location_gist "
        "ON institutions USING GIST (location)"
    )

    op.create_table(
        "hazard_polygons",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "municipio_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("municipios.id"), nullable=False,
        ),
        sa.Column("emergency_type", EMERGENCY_TYPE, nullable=False),
        sa.Column("categoria", HAZARD_CATEGORY, nullable=False),
        sa.Column(
            "geom",
            geoalchemy2.Geometry(geometry_type="MULTIPOLYGON", srid=4326),
            nullable=False,
        ),
        sa.Column("source", sa.String(200), nullable=True),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("valid_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            nullable=False, server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_hazard_polygons_municipio", "hazard_polygons", ["municipio_id"])
    op.execute(
        "CREATE INDEX ix_hazard_polygons_geom_gist "
        "ON hazard_polygons USING GIST (geom)"
    )

    op.create_table(
        "graph_artifacts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "municipio_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("municipios.id"), nullable=False, unique=True,
        ),
        sa.Column("url", sa.Text, nullable=False),
        sa.Column("node_count", sa.Integer, nullable=False),
        sa.Column("edge_count", sa.Integer, nullable=False),
        sa.Column("graph_hash", sa.String(64), nullable=False),
        sa.Column("built_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            nullable=False, server_default=sa.func.now(),
        ),
        sa.CheckConstraint("node_count >= 0", name="ck_graph_node_count_positive"),
        sa.UniqueConstraint("municipio_id", name="uq_graph_municipio"),
    )


def downgrade() -> None:
    # Orden inverso a upgrade. SQLAlchemy auto-dropea los enums junto
    # con la última tabla que los usa (comportamiento por defecto),
    # pero acá los listamos explícitamente por si alguna migración
    # futura agrega columnas con el mismo enum y el auto-drop no aplica.
    op.drop_table("graph_artifacts")
    op.drop_table("hazard_polygons")
    op.drop_table("institutions")
    op.drop_table("shelters")
    op.drop_table("group_members")
    op.drop_table("family_groups")
    op.drop_table("missing_persons")
    op.drop_table("public_alerts")
    op.drop_table("citizen_reports")
    op.drop_index("ix_users_firebase_uid", table_name="users")
    op.drop_table("users")
    op.drop_table("municipios")
    for name in (
        "institution_type", "missing_status", "member_status", "emergency_type",
        "hazard_category", "severity", "report_type", "user_role",
    ):
        op.execute(f"DROP TYPE IF EXISTS {name}")
    # No droppeamos PostGIS — podría estar usada por otros schemas.
