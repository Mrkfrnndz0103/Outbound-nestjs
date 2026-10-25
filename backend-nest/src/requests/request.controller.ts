import { Body, Controller, Get, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CreateRequestDto, ListRequestsQuery, RequestActionDto, RequestIdParam } from './request.dto.js';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js';
import { RequestService } from './request.service.js';

type AuthenticatedRequest = Request & { user?: { sub?: string } };

@Controller('requests')
@UseGuards(SupabaseAuthGuard)
export class RequestController {
  constructor(private readonly requests: RequestService) {}

  @Get()
  list(@Query() query: ListRequestsQuery) {
    return this.requests.list(query);
  }

  @Get(':id')
  async show(@Param() params: RequestIdParam) {
    const request = await this.requests.get(params.id);
    if (!request) throw new NotFoundException('Request not found.');
    return request;
  }

  @Post()
  create(@Body() input: CreateRequestDto, @Req() request: AuthenticatedRequest) {
    const actorId = request.user?.sub;
    if (!actorId) throw new NotFoundException('Authenticated user identity is missing.');
    return this.requests.create(input, actorId);
  }

  @Post(':id/:action')
  async action(@Param() params: RequestIdParam & { action: string }, @Body() input: RequestActionDto) {
    const request = await this.requests.action(params.id, params.action, input);
    if (!request) throw new NotFoundException('Request not found.');
    return request;
  }
}
