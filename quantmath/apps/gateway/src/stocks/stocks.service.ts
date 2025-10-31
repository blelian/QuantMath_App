import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Stock } from './stock.entity';

@Injectable()
export class StocksService {
  constructor(
    @InjectRepository(Stock)
    private stockRepository: Repository<Stock>,
  ) {}

  findAll() {
    return this.stockRepository.find();
  }

  create(stockData: Partial<Stock>) {
    const stock = this.stockRepository.create(stockData);
    return this.stockRepository.save(stock);
  }
}
