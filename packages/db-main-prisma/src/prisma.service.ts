import type { OnModuleInit } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { nanoid } from 'nanoid';
import type { ClsService } from 'nestjs-cls';

interface ITx {
  client?: Prisma.TransactionClient;
  id?: string;
  rawOpMap?: unknown;
}

function proxyClient(tx: Prisma.TransactionClient) {
  return new Proxy(tx, {
    get(target, p) {
      if (p === '$queryRawUnsafe' || p === '$executeRawUnsafe') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return async function (query: string, ...args: any[]) {
          const stack = new Error().stack;
          try {
            // eslint-disable-next-line prefer-spread
            return await target[p](query, ...args);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } catch (e: any) {
            // you can debug here
            const newError = new Error(`An error occurred in ${p}: ${e.message}`);
            newError.stack = stack;
            throw newError;
          }
        };
      }
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      return target[p];
    },
  });
}

@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, 'query'>
  implements OnModuleInit
{
  private readonly logger = new Logger(PrismaService.name);

  private afterTxCb?: () => void;

  constructor(private readonly cls: ClsService<{ tx: ITx }>) {
    const logConfig = {
      log: [
        {
          level: 'query',
          emit: 'event',
        },
        {
          level: 'error',
          emit: 'stdout',
        },
        {
          level: 'info',
          emit: 'stdout',
        },
        {
          level: 'warn',
          emit: 'stdout',
        },
      ],
    };
    const initialConfig = process.env.NODE_ENV === 'production' ? {} : { ...logConfig };

    super(initialConfig);
  }

  bindAfterTransaction(fn: () => void) {
    this.afterTxCb = fn;
  }

  /**
   * Executes a transaction using the provided function and options.
   * If a transaction client is already defined in the current context, the function is executed using it.
   * Otherwise, a new transaction is created and the function is executed using it.
   * @param fn The function to execute within the transaction.
   * @param options The options to use when creating the transaction.
   * @returns The result of the executed function.
   */
  async $tx<R = unknown>(
    fn: (prisma: Prisma.TransactionClient) => Promise<R>,
    options?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: Prisma.TransactionIsolationLevel;
    }
  ): Promise<R> {
    let result: R = undefined as R;
    const txClient = this.cls.get('tx.client');
    if (txClient) {
      return await fn(txClient);
    }

    await this.cls.runWith(this.cls.get(), async () => {
      result = await super.$transaction<R>(async (prisma) => {
        prisma = proxyClient(prisma);
        this.cls.set('tx.client', prisma);
        this.cls.set('tx.id', nanoid());
        const res = await fn(prisma);
        this.cls.set('tx.client', undefined);
        this.cls.set('tx.id', undefined);
        return res;
      }, options);
      this.afterTxCb?.();
    });

    return result;
  }

  txClient(): Prisma.TransactionClient {
    const txClient = this.cls.get('tx.client');
    // const id = this.cls.get('tx.id');
    // console.log('transactionId', id);
    if (!txClient) {
      return this;
    }
    return txClient;
  }

  async onModuleInit() {
    await this.$connect();

    // await this.$queryRaw`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;`.catch((error) => {
    //   this.logger.error('Prisma Set `PRAGMA` Failed due to:', error.stack);
    //   process.exit(1);
    // });

    if (process.env.NODE_ENV === 'production') return;

    this.$on('query', async (e) => {
      this.logger.debug({
        Query: e.query.trim().replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')'),
        Params: e.params,
        Duration: `${e.duration} ms`,
      });
    });
  }
}