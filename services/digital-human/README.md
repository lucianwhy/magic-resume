# Digital Human Service

This directory contains the pinned OpenTalking source used by Magic Resume.
It runs as an independent Python/FastAPI service and is intentionally not
imported by `apps/web`, `services/api`, the CLI, or Skills.

## Runtime policy

- Do not commit `.env`, `.venv`, `logs/`, `models/`, caches, or generated media.
- Use `mock` mode first; it does not require a GPU or model weights.
- The Magic Resume widget reads `VITE_DIGITAL_HUMAN_API_BASE_URL` and calls
  `POST /sessions` and `POST /sessions/{session_id}/speak`.
- Real-time WebRTC and GPU model backends remain opt-in. Configure TURN and
  public ICE candidates on the target Linux server when remote browsers need
  relay connectivity.

The imported upstream snapshot is OpenTalking commit `1aa2516` (Apache-2.0).
Local WSL startup fixes were reviewed separately; only the generic model-path
fallbacks should be treated as production defaults. WSL mirrored-networking
workarounds are not required on the target Linux server.

## Local mock startup

```bash
uv sync --extra dev --python 3.11
cp .env.example .env
bash scripts/start_unified.sh --mock --api-port 8210
```

The service is then available at `http://127.0.0.1:8210`.
