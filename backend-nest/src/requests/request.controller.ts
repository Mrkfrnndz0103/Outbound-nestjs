import { Body, Controller, Get, Inject, NotFoundException, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CreateRequestDto, ListRequestsQuery, RequestActionDto, RequestIdParam } from './request.dto.js';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js';
import { RequestService } from './request.service.js';

type AuthenticatedRequest = Request & { user?: { sub?: string } };

@Controller(['requests', 'v1/requests'])
@UseGuards(SupabaseAuthGuard)
export class RequestController {
  constructor(@Inject(RequestService) private readonly requests: RequestService) {}

  @Get()
  list(@Query() query: ListRequestsQuery) {
    return this.requests.list(query);
  }

  @Get('queue')
  queue(@Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    return this.requests.queue(limit ? Number(limit) : 100, cursor);
  }

  @Get('summary')
  summary() {
    return this.requests.summary();
  }

  @Get('metrics')
  metrics() {
    return this.requests.metrics();
  }

  @Get('analytics')
  analytics() {
    return this.requests.analytics();
  }

  @Post('bulk-approve')
  bulkApprove(@Body() input: { ids?: string[] }, @Req() request: AuthenticatedRequest) {
    const actorId = request.user?.sub;
    if (!actorId) throw new NotFoundException('Authenticated user identity is missing.');
    return this.requests.bulkApprove(input.ids ?? [], actorId);
  }

  @Get(':id/events')
  async events(@Param() params: RequestIdParam) {
    const request = await this.requests.get(params.id);
    if (!request) throw new NotFoundException('Request not found.');
    return this.requests.events(params.id);
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

  @Put(':id')
  async update(
    @Param() params: RequestIdParam,
    @Body() input: CreateRequestDto,
    @Req() httpRequest: AuthenticatedRequest,
  ) {
    const actorId = httpRequest.user?.sub;
    if (!actorId) throw new NotFoundException('Authenticated user identity is missing.');
    const updatedRequest = await this.requests.update(params.id, input, actorId);
    if (!updatedRequest) throw new NotFoundException('Request not found.');
    return updatedRequest;
  }

  @Post(':id/:action')
  async action(
    @Param() params: RequestIdParam & { action: string },
    @Body() input: RequestActionDto,
    @Req() httpRequest: AuthenticatedRequest,
  ) {
    const actorId = httpRequest.user?.sub;
    if (!actorId) throw new NotFoundException('Authenticated user identity is missing.');
    const updatedRequest = await this.requests.action(params.id, params.action, input, actorId);
    if (!updatedRequest) throw new NotFoundException('Request not found.');
    return updatedRequest;
  }
}
