from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List
from decimal import Decimal
from datetime import datetime
from pydantic import BaseModel, Field
from core.auth import require_admin, require_super_admin
from core.credits import credit_service
from core.services.supabase import DBConnection
from core.utils.logger import logger
import stripe
from core.utils.config import config

router = APIRouter(prefix="/admin/billing", tags=["admin-billing"])

class CreditAdjustmentRequest(BaseModel):
    account_id: str
    amount: Decimal = Field(..., description="Amount to add (positive) or remove (negative)")
    reason: str
    notify_user: bool = True

class RefundRequest(BaseModel):
    account_id: str
    amount: Decimal
    reason: str
    stripe_refund: bool = False
    payment_intent_id: Optional[str] = None

class UserSearchRequest(BaseModel):
    email: Optional[str] = None
    account_id: Optional[str] = None

class GrantCreditsRequest(BaseModel):
    account_ids: List[str]
    amount: Decimal
    reason: str
    notify_users: bool = True

@router.post("/credits/adjust")
async def adjust_user_credits(
    request: CreditAdjustmentRequest,
    admin: dict = Depends(require_admin)
):
    if abs(request.amount) > 1000 and admin.get('role') != 'super_admin':
        raise HTTPException(status_code=403, detail="Adjustments over $1000 require super_admin role")
    
    try:
        if request.amount > 0:
            new_balance = await credit_service.add_credits(
                account_id=request.account_id,
                amount=request.amount,
                type='admin_grant',
                description=f"Admin adjustment: {request.reason}",
                metadata={'created_by': admin['account_id']}
            )
        else:
            result = await credit_service.deduct_credits(
                account_id=request.account_id,
                amount=abs(request.amount),
                description=f"Admin deduction: {request.reason}",
                reference_type='admin_adjustment'
            )
            if not result['success']:
                raise HTTPException(status_code=400, detail="Insufficient balance for deduction")
            new_balance = result['new_balance']
        
        db = DBConnection()
        client = await db.client
        await client.table('admin_actions_log').insert({
            'admin_account_id': admin['account_id'],
            'action_type': 'credit_adjustment',
            'target_account_id': request.account_id,
            'details': {
                'amount': float(request.amount),
                'reason': request.reason,
                'new_balance': float(new_balance)
            }
        }).execute()
        
        logger.info(f"[ADMIN] Admin {admin['account_id']} adjusted credits for {request.account_id} by {request.amount}")
        
        return {
            'success': True,
            'new_balance': float(new_balance),
            'adjustment': float(request.amount),
            'reason': request.reason
        }
        
    except Exception as e:
        logger.error(f"Credit adjustment failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/credits/grant-bulk")
async def grant_bulk_credits(
    request: GrantCreditsRequest,
    admin: dict = Depends(require_admin)
):
    if request.amount > 100:
        admin = await require_super_admin(admin)
    
    results = []
    for account_id in request.account_ids:
        try:
            new_balance = await credit_service.add_credits(
                account_id=account_id,
                amount=request.amount,
                type='admin_grant',
                description=request.reason,
                metadata={'created_by': admin['account_id']}
            )
            results.append({
                'account_id': account_id,
                'success': True,
                'new_balance': float(new_balance)
            })
        except Exception as e:
            results.append({
                'account_id': account_id,
                'success': False,
                'error': str(e)
            })
    
    successful = sum(1 for r in results if r['success'])
    logger.info(f"[ADMIN] Admin {admin['account_id']} granted {request.amount} credits to {successful}/{len(request.account_ids)} users")
    
    return {
        'total_users': len(request.account_ids),
        'successful': successful,
        'failed': len(request.account_ids) - successful,
        'results': results
    }

@router.post("/refund")
async def process_refund(
    request: RefundRequest,
    admin: dict = Depends(require_super_admin)
):
    new_balance = await credit_service.add_credits(
        account_id=request.account_id,
        amount=request.amount,
        type='refund',
        description=f"Refund: {request.reason}",
        metadata={'created_by': admin['account_id']}
    )
    
    refund_id = None
    if request.stripe_refund and request.payment_intent_id:
        try:
            stripe.api_key = config.STRIPE_SECRET_KEY
            refund = await stripe.Refund.create_async(
                payment_intent=request.payment_intent_id,
                amount=int(request.amount * 100),
                reason='requested_by_customer',
                metadata={'admin_account_id': admin['account_id'], 'reason': request.reason}
            )
            refund_id = refund.id
        except Exception as e:
            logger.error(f"Stripe refund failed: {e}")
    
    logger.info(f"[ADMIN] Admin {admin['account_id']} processed refund of {request.amount} for user {request.account_id}")
    
    return {
        'success': True,
        'new_balance': float(new_balance),
        'refund_amount': float(request.amount),
        'stripe_refund_id': refund_id
    }

@router.get("/user/{account_id}/summary")
async def get_user_billing_summary(
    account_id: str,
    admin: dict = Depends(require_admin)
):
    summary = await credit_service.get_account_summary(account_id)
    recent_transactions = await credit_service.get_ledger(account_id, limit=20)
    
    db = DBConnection()
    client = await db.client
    
    subscription_result = await client.schema('basejump').from_('billing_subscriptions').select('*').eq('account_id', account_id).order('created', desc=True).limit(1).execute()
    
    subscription = subscription_result.data[0] if subscription_result.data else None
    
    return {
        'account_id': account_id,
        'credit_account': summary,
        'subscription': subscription,
        'recent_transactions': recent_transactions
    }

@router.get("/user/{account_id}/transactions")
async def get_user_transactions(
    account_id: str,
    limit: int = 100,
    offset: int = 0,
    type_filter: Optional[str] = None,
    admin: dict = Depends(require_admin)
):
    transactions = await credit_service.get_ledger(
        account_id=account_id,
        limit=limit,
        offset=offset,
        type_filter=type_filter
    )
    
    return {
        'account_id': account_id,
        'transactions': transactions,
        'count': len(transactions)
    }

@router.post("/user/search")
async def search_user(
    request: UserSearchRequest,
    admin: dict = Depends(require_admin)
):
    db = DBConnection()
    client = await db.client
    
    user = None
    
    if request.account_id:
        result = await client.schema('basejump').from_('accounts').select('id, created_at').eq('id', request.account_id).execute()
        if result.data and len(result.data) > 0:
            account = result.data[0]
            email_result = await client.schema('basejump').from_('billing_customers').select('email').eq('account_id', account['id']).execute()
            email = email_result.data[0]['email'] if email_result.data else 'N/A'
            user = {
                'id': account['id'],
                'email': email,
                'created_at': account['created_at']
            }
    elif request.email:
        customer_result = await client.schema('basejump').from_('billing_customers').select('account_id, email').eq('email', request.email).execute()
        if customer_result.data and len(customer_result.data) > 0:
            customer = customer_result.data[0]
            account_result = await client.schema('basejump').from_('accounts').select('created_at').eq('id', customer['account_id']).execute()
            created_at = account_result.data[0]['created_at'] if account_result.data else None
            user = {
                'id': customer['account_id'],
                'email': customer['email'],
                'created_at': created_at
            }
    else:
        raise HTTPException(status_code=400, detail="Provide either account_id or email")
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    summary = await credit_service.get_account_summary(user['id'])
    
    return {
        'user': user,
        'credit_account': summary
    }

@router.post("/migrate-user/{account_id}")
async def migrate_user_to_credits(
    account_id: str,
    admin: dict = Depends(require_super_admin)
):
    db = DBConnection()
    client = await db.client
    
    try:
        result = await client.rpc('migrate_user_to_credits', {'p_account_id': account_id}).execute()
        logger.info(f"[ADMIN] Admin {admin['account_id']} migrated user {account_id} to credit system")
        
        return {
            'success': True,
            'account_id': account_id,
            'message': 'User migrated to credit system'
        }
    except Exception as e:
        logger.error(f"[ADMIN] Migration failed for user {account_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
