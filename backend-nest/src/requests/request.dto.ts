import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class ListRequestsQuery {
  @IsOptional()
  @IsString()
  @IsIn(['PENDING', 'REQUESTED', 'DOCKING', 'DOCKED', 'REJECTED', 'CANCELLED'])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;
}

export class CreateRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  cluster!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  region!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  truckType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  truckSize?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  dockNo?: string;
}

export class RequestActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rejectionRemarks?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  plateNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  driverId?: string;
}

export class RequestIdParam {
  @IsUUID()
  id!: string;
}
