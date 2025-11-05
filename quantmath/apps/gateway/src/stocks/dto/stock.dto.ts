// quantmath/apps/gateway/src/stocks/dto/stock.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class StockDto {
  @ApiProperty({ example: 'AAPL', description: 'Stock symbol' })
  symbol: string;

  @ApiProperty({ example: 271.40, description: 'Current stock price' })
  price: number;

  @ApiProperty({
    example: '2025-10-31T09:59:04.391Z',
    description: 'Date and time of last update in ISO 8601 format',
    type: String,
  })
  updatedAt: Date;
}
