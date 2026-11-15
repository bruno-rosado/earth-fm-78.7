from fastapi import APIRouter

from . import narration, tracks

router = APIRouter(prefix="/api")
router.include_router(tracks.router)
router.include_router(narration.router)
