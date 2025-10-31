import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Stock } from './stock.entity';

@Injectable()
export class StocksService {
  constructor(
    @InjectRepository(Stock)
    private readonly stockRepository: Repository<Stock>,
  ) {}

  findAll() {
    return this.stockRepository.find();
  }

  async findOne(id: number) {
    const stock = await this.stockRepository.findOneBy({ id });
    if (!stock) throw new NotFoundException(`Stock with ID ${id} not found`);
    return stock;
  }

  create(stockData: Partial<Stock>) {
    const stock = this.stockRepository.create(stockData);
    return this.stockRepository.save(stock);
  }
}
