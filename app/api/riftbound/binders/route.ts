import { withApiMetrics } from '@/lib/api-metrics';
import { NextResponse } from 'next/server';
import { getRouteErrorResponse, readJsonBody, requireString } from '@/lib/api-utils';
import { getAuthenticatedUserId } from '@/lib/auth-server';
import { getRiftboundCardById } from '@/lib/riftbound';
import { getRiftboundBinderLimit, loadRiftboundBinders } from '@/lib/riftbound-server';
import { RIFTBOUND_BINDER_PAGE_COUNT, RIFTBOUND_BINDER_SLOT_COUNT, type RiftboundBinderFinish } from '@/lib/riftbound-binders';
import { getSupabaseServiceClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';

type BinderBody = {
  action?: unknown;
  binderId?: unknown;
  name?: unknown;
  description?: unknown;
  pages?: unknown;
};

function parsePageNumber(value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > RIFTBOUND_BINDER_PAGE_COUNT) {
    throw new Error(`pageNumber must be a whole number between 1 and ${RIFTBOUND_BINDER_PAGE_COUNT}.`);
  }
  return value;
}

function parseSlotIndex(value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= RIFTBOUND_BINDER_SLOT_COUNT) {
    throw new Error(`slotIndex must be a whole number between 0 and ${RIFTBOUND_BINDER_SLOT_COUNT - 1}.`);
  }
  return value;
}

function parseFinish(value: unknown): RiftboundBinderFinish {
  if (value !== 'normal' && value !== 'foil') throw new Error('finish must be normal or foil.');
  return value;
}

type SavedBinderPage = {
  pageNumber: number;
  pageName: string;
  slots: Array<{ slotIndex: number; cardId: string; finish: RiftboundBinderFinish }>;
};

function parseSavedPages(value: unknown): SavedBinderPage[] {
  if (!Array.isArray(value) || value.length !== RIFTBOUND_BINDER_PAGE_COUNT) {
    throw new Error(`A binder save must include all ${RIFTBOUND_BINDER_PAGE_COUNT} pages.`);
  }

  const pageNumbers = new Set<number>();
  return value.map((rawPage) => {
    if (!rawPage || typeof rawPage !== 'object') throw new Error('Invalid binder page.');
    const page = rawPage as Record<string, unknown>;
    const pageNumber = parsePageNumber(page.pageNumber);
    if (pageNumbers.has(pageNumber)) throw new Error('Binder pages cannot be duplicated.');
    pageNumbers.add(pageNumber);
    const pageName = requireString(page.pageName, 'pageName').trim();
    if (pageName.length < 1 || pageName.length > 80) throw new Error('Page names must be between 1 and 80 characters.');
    if (!Array.isArray(page.slots) || page.slots.length > RIFTBOUND_BINDER_SLOT_COUNT) throw new Error('A binder page cannot contain more than nine cards.');

    const slotIndexes = new Set<number>();
    const slots = page.slots.map((rawSlot) => {
      if (!rawSlot || typeof rawSlot !== 'object') throw new Error('Invalid binder slot.');
      const slot = rawSlot as Record<string, unknown>;
      const slotIndex = parseSlotIndex(slot.slotIndex);
      if (slotIndexes.has(slotIndex)) throw new Error('Binder slots cannot be duplicated.');
      slotIndexes.add(slotIndex);
      const cardId = requireString(slot.cardId, 'cardId');
      if (!getRiftboundCardById(cardId)) throw new Error('Riftbound card not found.');
      return { slotIndex, cardId, finish: parseFinish(slot.finish) };
    });

    return { pageNumber, pageName, slots };
  });
}

function parseBinderDetails(body: BinderBody) {
  const name = requireString(body.name, 'name').trim();
  if (name.length > 80) throw new Error('Binder names must be 80 characters or fewer.');
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (description.length > 500) throw new Error('Binder descriptions must be 500 characters or fewer.');
  return { name, description };
}

async function getOwnedBinder(userId: string, binderId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from('riftbound_binders')
    .select('id')
    .eq('id', binderId)
    .eq('user_id', userId)
    .maybeSingle<{ id: string }>();
  if (error) throw error;
  if (!data) throw new Error('Riftbound binder not found.');
}

export const GET = withApiMetrics('/api/riftbound/binders', async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    return NextResponse.json({ binders: await loadRiftboundBinders(userId), limit: await getRiftboundBinderLimit(userId) });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});

export const POST = withApiMetrics('/api/riftbound/binders', async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const { name, description } = parseBinderDetails(await readJsonBody<BinderBody>(request));
    const { data, error } = await getSupabaseServiceClient()
      .rpc('create_riftbound_binder', { p_user_id: userId, p_name: name, p_description: description });
    if (error) throw error;
    if (!Array.isArray(data) || !data[0]) throw new Error('Unable to create Riftbound binder.');
    return NextResponse.json({ binders: await loadRiftboundBinders(userId), limit: await getRiftboundBinderLimit(userId), binder: data[0] }, { status: 201 });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});

export const PATCH = withApiMetrics('/api/riftbound/binders', async function PATCH(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const body = await readJsonBody<BinderBody>(request);
    const action = body.action;
    const binderId = requireString(body.binderId, 'binderId');
    await getOwnedBinder(userId, binderId);
    const supabase = getSupabaseServiceClient();

    if (action === 'binder') {
      const { name, description } = parseBinderDetails(body);
      const { error } = await supabase.from('riftbound_binders').update({ name, description, updated_at: new Date().toISOString() }).eq('id', binderId).eq('user_id', userId);
      if (error) throw error;
    } else if (action === 'save') {
      const pages = parseSavedPages(body.pages);
      const now = new Date().toISOString();
      const { error: pagesUpsertError } = await supabase.from('riftbound_binder_pages').upsert(
        pages.map((page) => ({ binder_id: binderId, page_number: page.pageNumber, name: page.pageName, updated_at: now })),
        { onConflict: 'binder_id,page_number' },
      );
      if (pagesUpsertError) throw pagesUpsertError;

      const { data: pageRows, error: pageRowsError } = await supabase
        .from('riftbound_binder_pages')
        .select('id, page_number')
        .eq('binder_id', binderId)
        .returns<Array<{ id: string; page_number: number }>>();
      if (pageRowsError) throw pageRowsError;
      if (!pageRows || pageRows.length !== RIFTBOUND_BINDER_PAGE_COUNT) throw new Error('Riftbound binder pages are incomplete.');

      const pageIds = pageRows.map((page) => page.id);
      const { error: slotsDeleteError } = await supabase.from('riftbound_binder_slots').delete().in('page_id', pageIds);
      if (slotsDeleteError) throw slotsDeleteError;

      const pageIdByNumber = new Map(pageRows.map((page) => [page.page_number, page.id]));
      const slotRows = pages.flatMap((page) => page.slots.map((slot) => ({
        page_id: pageIdByNumber.get(page.pageNumber) as string,
        slot_index: slot.slotIndex,
        card_id: slot.cardId,
        finish: slot.finish,
        updated_at: now,
      })));
      if (slotRows.length > 0) {
        const { error: slotsInsertError } = await supabase.from('riftbound_binder_slots').insert(slotRows);
        if (slotsInsertError) throw slotsInsertError;
      }
      const { error: binderUpdateError } = await supabase.from('riftbound_binders').update({ updated_at: now }).eq('id', binderId).eq('user_id', userId);
      if (binderUpdateError) throw binderUpdateError;
    } else {
      throw new Error('Invalid binder action.');
    }

    return NextResponse.json({ binders: await loadRiftboundBinders(userId), limit: await getRiftboundBinderLimit(userId) });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});

export const DELETE = withApiMetrics('/api/riftbound/binders', async function DELETE(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    const binderId = requireString((await readJsonBody<BinderBody>(request)).binderId, 'binderId');
    const supabase = getSupabaseServiceClient();
    const { data: binder, error: binderError } = await supabase
      .from('riftbound_binders')
      .select('id, created_at')
      .eq('id', binderId)
      .eq('user_id', userId)
      .maybeSingle<{ id: string; created_at: string }>();
    if (binderError) throw binderError;
    if (!binder) return NextResponse.json({ error: 'Riftbound binder not found.' }, { status: 404 });

    const { data: userBinders, error: userBindersError } = await supabase
      .from('riftbound_binders')
      .select('id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .returns<Array<{ id: string; created_at: string }>>();
    if (userBindersError) throw userBindersError;
    const binderIndex = Math.max(0, (userBinders ?? []).findIndex((candidate) => candidate.id === binder.id));
    const now = new Date().toISOString();
    const { error: resetError } = await supabase
      .from('riftbound_binders')
      .update({ name: `Binder ${binderIndex + 1}`, description: '', updated_at: now })
      .eq('id', binder.id)
      .eq('user_id', userId);
    if (resetError) throw resetError;

    const { data: pages, error: pagesError } = await supabase
      .from('riftbound_binder_pages')
      .select('id, page_number')
      .eq('binder_id', binder.id)
      .returns<Array<{ id: string; page_number: number }>>();
    if (pagesError) throw pagesError;
    const pageIds = (pages ?? []).map((page) => page.id);
    if (pageIds.length > 0) {
      const { error: slotsError } = await supabase.from('riftbound_binder_slots').delete().in('page_id', pageIds);
      if (slotsError) throw slotsError;
      const { error: pagesResetError } = await supabase.from('riftbound_binder_pages').upsert(
        (pages ?? []).map((page) => ({ id: page.id, binder_id: binder.id, page_number: page.page_number, name: `Page ${page.page_number}`, updated_at: now })),
        { onConflict: 'binder_id,page_number' },
      );
      if (pagesResetError) throw pagesResetError;
    }

    return NextResponse.json({ resetBinderId: binder.id, binders: await loadRiftboundBinders(userId), limit: await getRiftboundBinderLimit(userId) });
  } catch (error) {
    return getRouteErrorResponse(error);
  }
});
