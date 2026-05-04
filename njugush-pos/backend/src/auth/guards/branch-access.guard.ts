import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class BranchAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const body = request.body;
    const params = request.params;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    if (user.role === 'SUPER_ADMIN' || user.role === 'OVERALL_MANAGER') {
      return true;
    }

    const targetBranchId = body.branchId || params.branchId || body.branch;
    if (targetBranchId && targetBranchId !== user.branchId) {
      throw new ForbiddenException('Access denied for this branch');
    }

    return true;
  }
}
