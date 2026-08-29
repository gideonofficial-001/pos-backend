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
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';

import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // CREATE USER
  // ─────────────────────────────────────────────────────────────────────────

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create new user (Admin only)' })
  async create(
    @Body() createUserDto: CreateUserDto,
    @GetUser('userId') userId: string,
  ) {
    return this.usersService.create(createUserDto, userId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GET ALL USERS
  // ─────────────────────────────────────────────────────────────────────────

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER)
  @ApiOperation({ summary: 'Get all users' })
  async findAll() {
    return this.usersService.findAll();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // USER STATISTICS
  // ─────────────────────────────────────────────────────────────────────────

  @Get('stats')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get user statistics' })
  async getStats() {
    return this.usersService.getStats();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SELF MANAGEMENT
  // These routes MUST come before /:id
  // ─────────────────────────────────────────────────────────────────────────

  @Patch('me/profile')
  @ApiOperation({ summary: 'Update own profile' })
  async updateOwnProfile(
    @Request() req,
    @Body() updateData: {
      firstName?: string;
      lastName?: string;
    },
  ) {
    return this.usersService.updateProfile(
      req.user.userId,
      updateData,
    );
  }

  @Patch('me/password')
  @ApiOperation({ summary: 'Update own password' })
  async updateOwnPassword(
    @Request() req,
    @Body()
    body: {
      currentPassword: string;
      newPassword: string;
    },
  ) {
    return this.usersService.updatePassword(
      req.user.userId,
      body.currentPassword,
      body.newPassword,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LOGIN ACTIVITY
  // These routes MUST come before /:id
  // ─────────────────────────────────────────────────────────────────────────

  @Get('login-activity/suspicious')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get suspicious login activity across all users',
  })
  async getSuspiciousLogins(
    @Query('days') days = '7',
  ) {
    const since = new Date(
      Date.now() - +days * 24 * 60 * 60 * 1000,
    );

    return this.prisma.loginLocation.findMany({
      where: {
        isSuspicious: true,
        createdAt: {
          gte: since,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            branch: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });
  }

  @Get('login-activity/all')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get all login activity',
  })
  async getAllLoginActivity(
    @Query('days') days = '7',
    @Query('userId') userId?: string,
  ) {
    const since = new Date(
      Date.now() - +days * 24 * 60 * 60 * 1000,
    );

    return this.prisma.loginLocation.findMany({
      where: {
        createdAt: {
          gte: since,
        },
        ...(userId && {
          userId,
        }),
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            branch: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GET USER BY ID
  // MUST come after specific named routes
  // ─────────────────────────────────────────────────────────────────────────

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER)
  @ApiOperation({
    summary: 'Get user by ID',
  })
  async findOne(
    @Param('id') id: string,
  ) {
    return this.usersService.findOne(id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GET USER LOGIN HISTORY
  // ─────────────────────────────────────────────────────────────────────────

  @Get(':id/login-history')
  @Roles(UserRole.SUPER_ADMIN, UserRole.OVERALL_MANAGER)
  @ApiOperation({
    summary: 'Get login history for a specific user',
  })
  async getUserLoginHistory(
    @Param('id') userId: string,
    @Query('days') days = '30',
  ) {
    const since = new Date(
      Date.now() - +days * 24 * 60 * 60 * 1000,
    );

    const history = await this.prisma.loginLocation.findMany({
      where: {
        userId,
        createdAt: {
          gte: since,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            branch: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    return history.map((login) => ({
      id: login.id,
      date: login.createdAt,
      status: login.status,

      location:
        login.latitude != null &&
        login.longitude != null
          ? {
              latitude: login.latitude,
              longitude: login.longitude,
              accuracy: login.accuracy,
              city: login.city,
              region: login.region,
              country: login.country,
            }
          : null,

      ipAddress: login.ipAddress,
      deviceType: login.deviceType,
      isSuspicious: login.isSuspicious,
      blockReason: login.blockReason,
      user: login.user,
    }));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UPDATE USER
  // ─────────────────────────────────────────────────────────────────────────

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Update user (Admin only)',
  })
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @GetUser('userId') userId: string,
  ) {
    return this.usersService.update(
      id,
      updateUserDto,
      userId,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE USER
  // ─────────────────────────────────────────────────────────────────────────

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Delete user with confirmation (Admin only)',
  })
  async remove(
    @Param('id') id: string,
    @Query('confirmation') confirmation: string,
    @GetUser('userId') userId: string,
  ) {
    // IMPORTANT:
    // UsersService.remove() expects:
    // remove(id, performedBy, confirmationText)
    //
    // Therefore the correct order is:
    // remove(id, userId, confirmation)

    return this.usersService.remove(
      id,
      userId,
      confirmation,
    );
  }
}
