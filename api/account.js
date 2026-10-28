import { createAccountAuth } from './_lib/account-auth.js';

export default function account(req, res) {
  return createAccountAuth().handle(req, res);
}
