import { NextResponse } from 'next/server';

export async function POST() {
  const res = NextResponse.json({ status: 'success' });
  res.cookies.delete('gbm_access');
  res.cookies.delete('gbm_refresh');
  return res;
}
