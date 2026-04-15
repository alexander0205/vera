import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { systemSettings, rncPadron } from '@/lib/db/schema';
import { eq, count } from 'drizzle-orm';

export async function GET() {
  const [setting, total] = await Promise.all([
    db.select().from(systemSettings).where(eq(systemSettings.key, 'rnc_last_sync')).limit(1),
    db.select({ c: count() }).from(rncPadron),
  ]);

  return NextResponse.json({
    lastSync: setting[0]?.value ?? null,
    totalRecords: total[0]?.c ?? 0,
    needsUpdate: !setting[0] || new Date(setting[0].value!) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  });
}
