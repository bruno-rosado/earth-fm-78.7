.PHONY: setup run-dev backend frontend

VENV := backend/.venv

# Install backend + frontend dependencies.
setup:
	test -d $(VENV) || python3 -m venv $(VENV)
	$(VENV)/bin/pip install -r backend/requirements.txt
	cd frontend && npm install

# Run backend (port 8000) and frontend (port 5173) together. Ctrl+C stops both.
run-dev:
	@trap 'kill 0' INT TERM EXIT; \
	$(MAKE) backend & \
	$(MAKE) frontend & \
	wait

backend:
	cd backend && .venv/bin/uvicorn main:app --reload --port 8000

frontend:
	cd frontend && npm run dev
