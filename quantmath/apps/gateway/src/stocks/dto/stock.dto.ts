import { ApiProperty } from '@nestjs/swagger';

export class StockDto {
  @ApiProperty({ example: 'AAPL', description: 'Stock symbol' })
  symbol: string;

  @ApiProperty({ example: 173.45, description: 'Current stock price' })
  price: number;

  @ApiProperty({ example: '2025-10-31', description: 'Date of last update' })
  updatedAt: Date;
}
