import { Router } from 'express';
import {
  getOrCreateConversation,
  sendMessage,
  markMessagesAsRead,
  getConversations,
} from '../controllers/message.controller';
import { verifyToken } from '../middleware/auth.middleware';

const router = Router();

router.use(verifyToken);

router.get('/conversations', getConversations);
router.get('/conversations/order/:orderId', getOrCreateConversation);
router.post('/send', sendMessage);
router.put('/conversations/:conversationId/read', markMessagesAsRead);

export default router;
