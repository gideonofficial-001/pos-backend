import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Inventory')
@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.OVERALL_MANAGER,
    UserRole.BRANCH_MANAGER,
  )
  @ApiOperation({ summary: 'Get inventory items' })
  async findAll(
    @Query('branchId') branchId?: string,
    @Query('lowStock') lowStock?: string,
    @GetUser() user?: any,
  ) {
    return this.inventoryService.findAll({
      branchId,
      user,
      lowStock: lowStock === 'true',
    });
  }

  @Get('low-stock')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.OVERALL_MANAGER,
    UserRole.BRANCH_MANAGER,
  )
  @ApiOperation({ summary: 'Get low stock items' })
  async getLowStock(@GetUser() user?: any) {
    return this.inventoryService.getLowStock(user);
  }

  @Get('movements')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER)
  @ApiOperation({ summary: 'Get stock movements' })
  async getStockMovements(
    @Query('inventoryId') inventoryId?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.inventoryService.getStockMovements(
      inventoryId,
      branchId,
    );
  }

  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.OVERALL_MANAGER,
    UserRole.BRANCH_MANAGER,
  )
  @ApiOperation({ summary: 'Get inventory item by ID' })
  async findOne(@Param('id') id: string) {
    return this.inventoryService.findOne(id);
  }

  @Post(':id/restock')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Restock inventory (Admin only)' })
  async restock(
    @Param('id') id: string,
    @Body('quantity') quantity: number,
    @GetUser('userId') userId: string,
  ) {
    return this.inventoryService.restock(id, quantity, userId);
  }

  @Post(':id/adjust')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Adjust stock quantity (Admin only)' })
  async adjustStock(
    @Param('id') id: string,
    @Body()
    payload: {
      quantity?: number;
      fullCylinders?: number;
      emptyCylinders?: number;
      reason: string;
    },
    @GetUser('userId') userId: string,
  ) {
    return this.inventoryService.adjustStock(id, payload, userId);
  }

  /**
   * Delete an inventory/product item.
   *
   * IMPORTANT:
   * - SUPER_ADMIN deleting from HQ = GLOBAL deletion.
   * - BRANCH_MANAGER deleting from their branch = LOCAL deletion.
   */
 @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Remove an item from a specific branch locally' })
  async delete(@Param('id') id: string) {
    return this.inventoryService.delete(id);
  }
}
