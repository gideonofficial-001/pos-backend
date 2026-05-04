import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InventoryService } from './inventory.service';
import { RestockDto } from './dto/restock.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BranchAccessGuard } from '../auth/guards/branch-access.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('inventory')
@UseGuards(AuthGuard(), RolesGuard)
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER)
  async getAllInventory() {
    return this.inventoryService.getAllInventory();
  }

  @Get('branch/:branchId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER, UserRole.BRANCH_MANAGER)
  @UseGuards(BranchAccessGuard)
  async getBranchInventory(@Param('branchId') branchId: string, @GetUser() user: any) {
    return this.inventoryService.getBranchInventory(branchId, user);
  }

  @Get('product/:productId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER)
  async getProductInventory(@Param('productId') productId: string) {
    return this.inventoryService.getProductInventory(productId);
  }

  @Get('alerts/low-stock')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER)
  async getLowStockAlerts() {
    return this.inventoryService.getLowStockAlerts();
  }

  @Get('reconciliation/cylinders')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER)
  async getCylinderReconciliation(@Query('branchId') branchId?: string) {
    return this.inventoryService.getCylinderReconciliation(branchId);
  }

  @Post('restock')
  @Roles(UserRole.SUPER_ADMIN)
  async restock(@Body() restockDto: RestockDto, @GetUser('userId') userId: string) {
    return this.inventoryService.restock(restockDto, userId);
  }

  @Post('adjust')
  @Roles(UserRole.SUPER_ADMIN)
  async adjustStock(@Body() adjustStockDto: AdjustStockDto, @GetUser('userId') userId: string) {
    return this.inventoryService.adjustStock(adjustStockDto, userId);
  }

  @Post('transfer')
  @Roles(UserRole.SUPER_ADMIN)
  async transferStock(
    @Body() transferDto: { fromBranchId: string; toBranchId: string; productId: string; quantity: number },
    @GetUser('userId') userId: string,
  ) {
    return this.inventoryService.transferStock(
      transferDto.fromBranchId,
      transferDto.toBranchId,
      transferDto.productId,
      transferDto.quantity,
      userId,
    );
  }
}
