import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

@Injectable()
export class BranchAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const body = request.body;
    const params = request.params;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Super Admin and Overall Manager can access all branches
    if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.OVERALL_MANAGER) {
      return true;
    }

    // Branch Manager can only access their assigned branch
    if (user.role === UserRole.BRANCH_MANAGER) {
      const requestedBranchId = body?.branchId || params?.branchId || request.query?.branchId;

      if (requestedBranchId && requestedBranchId !== user.branchId) {
        throw new ForbiddenException('You can only access your assigned branch');
      }

      // Attach branchId to body if not provided
      if (!requestedBranchId && user.branchId) {
        request.body.branchId = user.branchId;
      }

      return true;
    }

    return false;
  }
}