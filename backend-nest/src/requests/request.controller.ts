import { Body, Controller, Get, NotFoundException, Param, Post, Query, ServiceUnavailableException } from '@nestjs/common';
import { CreateRequestDto, ListRequestsQuery, RequestActionDto, RequestIdParam } from './request.dto.js';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js';
import { UseGuards } from '@nestjs/common';
import { RequestService } from './request.service.js';

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
  create(@Body() _input: CreateRequestDto) {
    throw new ServiceUnavailableException('Request creation is unavailable until role authorization migration is complete.');
  }

  @Post(':id/:action')
  async action(@Param() params: RequestIdParam & { action: string }, @Body() input: RequestActionDto) {
    const request = await this.requests.action(params.id, params.action, input);
    if (!request) throw new NotFoundException('Request not found.');
    return request;
  }
}
