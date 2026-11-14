import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, Integer, String, Text, Uuid, create_engine, func
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


class Base(DeclarativeBase):
    pass


class Scan(Base):
    __tablename__ = "scans"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    text_sha256: Mapped[str] = mapped_column(String(64), index=True)
    text: Mapped[str | None] = mapped_column(Text, nullable=True)  # only when STORE_TEXT=true
    word_count: Mapped[int] = mapped_column(Integer)
    token_count: Mapped[int] = mapped_column(Integer)
    score: Mapped[float] = mapped_column(Float)
    ai_probability: Mapped[float | None] = mapped_column(Float, nullable=True)
    label: Mapped[str] = mapped_column(String(20))
    detector: Mapped[str] = mapped_column(String(300))
    result: Mapped[dict] = mapped_column(JSON)  # full result; sentences hold spans, not text


def make_engine(url: str) -> Engine:
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=connect_args, pool_pre_ping=True)


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False)
