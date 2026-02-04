import { z } from 'zod';
import { ledgerService } from '../services/ledger.js';

const balanceQuerySchema = z.object({
  userId: z.string().min(1),
  businessId: z.string().min(1),
});

async function balanceRoutes(fastify) {
  fastify.get('/balance', async (request, reply) => {
    const { userId, businessId } = balanceQuerySchema.parse(request.query);
    const balance = await ledgerService.getBalance({ userId, businessId });
    return { balance };
  });
}

export default balanceRoutes;
