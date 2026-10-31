import { Global, Module } from '@nestjs/common';
import { BoundedWorkerPoolService } from './bounded-worker-pool.service';

@Global()
@Module({
  providers: [BoundedWorkerPoolService],
  exports: [BoundedWorkerPoolService],
})
export class WorkersModule {}
