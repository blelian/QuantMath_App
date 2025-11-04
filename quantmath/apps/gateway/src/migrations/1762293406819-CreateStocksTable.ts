import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateStocksTable1762293406819 implements MigrationInterface {
    name = 'CreateStocksTable1762293406819'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "stocks" ("id" SERIAL NOT NULL, "symbol" character varying NOT NULL, "price" double precision NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_abdd997b009437486baf7531854" UNIQUE ("symbol"), CONSTRAINT "PK_b5b1ee4ac914767229337974575" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "stocks"`);
    }

}
