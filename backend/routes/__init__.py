from fastapi import APIRouter

from . import hello, tracks

router = APIRouter(prefix="/api")
router.include_router(hello.router)
router.include_router(tracks.router)
