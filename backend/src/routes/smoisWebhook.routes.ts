// Public endpoints the social platforms call. No login: each request is verified by signature or signed state.
import { Router } from 'express';
import { oauthCallback, webhook } from '../controllers/smois/connection.controller';

const router = Router();
router.get('/oauth/:provider', oauthCallback);
router.all('/events/:provider', webhook);
export default router;
