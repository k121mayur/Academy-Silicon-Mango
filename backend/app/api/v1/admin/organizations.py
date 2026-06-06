from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import APIError
from app.db.session import get_db
from app.dependencies.auth import require_admin
from app.models.user import User
from app.models.webinar import Organization, Webinar
from app.schemas.webinar import OrganizationCreate, OrganizationUpdate
from app.services.storage_service import save_upload

router = APIRouter(prefix="/organizations", tags=["admin:organizations"])


def _to_dict(o: Organization, webinars_count: int = 0) -> dict:
    return {
        "id": str(o.id),
        "name": o.name,
        "logo_url": o.logo_url,
        "description": o.description,
        "website": o.website,
        "contact_email": o.contact_email,
        "is_default": o.is_default,
        "webinars_count": webinars_count,
        "created_at": o.created_at.isoformat() if o.created_at else None,
    }


@router.get("")
async def list_organizations(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    orgs = (
        await db.execute(select(Organization).order_by(Organization.is_default.desc(), Organization.name))
    ).scalars().all()
    counts: dict = {}
    if orgs:
        rows = await db.execute(
            select(Webinar.organization_id, func.count(Webinar.id)).group_by(Webinar.organization_id)
        )
        counts = {oid: cnt for oid, cnt in rows.all()}
    return {"success": True, "data": [_to_dict(o, counts.get(o.id, 0)) for o in orgs]}


@router.post("")
async def create_organization(
    payload: OrganizationCreate, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)
):
    org = Organization(
        name=payload.name.strip(),
        logo_url=payload.logo_url,
        description=payload.description,
        website=payload.website,
        contact_email=payload.contact_email,
        is_default=False,
    )
    db.add(org)
    await db.commit()
    await db.refresh(org)
    return {"success": True, "data": _to_dict(org)}


@router.get("/{org_id}")
async def get_organization(org_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    org = await db.get(Organization, org_id)
    if not org:
        raise APIError(code="NOT_FOUND", message="Organization not found", status_code=404)
    cnt = (
        await db.execute(select(func.count(Webinar.id)).where(Webinar.organization_id == org.id))
    ).scalar_one()
    return {"success": True, "data": _to_dict(org, cnt)}


@router.put("/{org_id}")
async def update_organization(
    org_id: str,
    payload: OrganizationUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    org = await db.get(Organization, org_id)
    if not org:
        raise APIError(code="NOT_FOUND", message="Organization not found", status_code=404)
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(org, k, v)
    await db.commit()
    await db.refresh(org)
    return {"success": True, "data": _to_dict(org)}


@router.delete("/{org_id}")
async def delete_organization(org_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    org = await db.get(Organization, org_id)
    if not org:
        raise APIError(code="NOT_FOUND", message="Organization not found", status_code=404)
    if org.is_default:
        raise APIError(code="ORG_DEFAULT", message="The default host cannot be deleted.", status_code=400)
    # Webinars keep working — their organization_id is SET NULL and the public page
    # falls back to the default brand.
    await db.delete(org)
    await db.commit()
    return {"success": True, "message": "Deleted"}


@router.post("/{org_id}/logo")
async def upload_logo(
    org_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    org = await db.get(Organization, org_id)
    if not org:
        raise APIError(code="NOT_FOUND", message="Organization not found", status_code=404)
    url = await save_upload(file, "org_logos")
    org.logo_url = url
    await db.commit()
    return {"success": True, "data": {"logo_url": url}}
