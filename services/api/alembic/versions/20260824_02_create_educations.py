"""create educations

Revision ID: 20260824_02
Revises: 20260810_01
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260824_02"
down_revision = "20260810_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "educations",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column("school", sa.String(length=200), nullable=False),
        sa.Column("degree", sa.String(length=100), nullable=True),
        sa.Column("major", sa.String(length=200), nullable=True),
        sa.Column("start_date", sa.String(length=30), nullable=True),
        sa.Column("end_date", sa.String(length=30), nullable=True),
        sa.Column("study_status", sa.String(length=20), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "ix_educations_user_id",
        "educations",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_educations_user_id", table_name="educations")
    op.drop_table("educations")