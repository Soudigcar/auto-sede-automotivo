import { NextResponse } from 'next/server';
import { cleanText, getAdminClient, requireMaster } from '@/lib/server/masterApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Resource =
  | 'brands'
  | 'models'
  | 'versions'
  | 'configurations'
  | 'fuels'
  | 'transmissions'
  | 'colors'
  | 'aliases'
  | 'suggestions';

type ConfigurationStatus = 'all' | 'active' | 'inactive';

type ConfigurationPageInput = {
  page: number;
  pageSize: number;
  search: string;
  status: ConfigurationStatus;
};

type ConfigurationSearchReferences = {
  brands: any[];
  models: any[];
  versions: any[];
  fuels: any[];
  transmissions: any[];
};

const CONFIGURATION_PAGE_SIZE = 100;

const tableByResource: Record<Resource, string> = {
  brands: 'vehicle_catalog_brands',
  models: 'vehicle_catalog_models',
  versions: 'vehicle_catalog_versions',
  configurations: 'vehicle_catalog_configurations',
  fuels: 'vehicle_catalog_fuels',
  transmissions: 'vehicle_catalog_transmissions',
  colors: 'vehicle_catalog_colors',
  aliases: 'vehicle_catalog_aliases',
  suggestions: 'vehicle_catalog_suggestions'
};

function asResource(value: unknown): Resource {
  const key = cleanText(value, 60) as Resource;
  if (!Object.prototype.hasOwnProperty.call(tableByResource, key)) {
    throw new Error('Tipo de cadastro inválido.');
  }
  return key;
}

function bool(value: unknown, fallback = true) {
  if (typeof value === 'boolean') return value;
  if (value === 'false' || value === 0 || value === '0') return false;
  if (value === 'true' || value === 1 || value === '1') return true;
  return fallback;
}

function integer(value: unknown, min?: number, max?: number) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return null;
  if (typeof min === 'number' && parsed < min) return null;
  if (typeof max === 'number' && parsed > max) return null;
  return parsed;
}

function decimal(value: unknown, min?: number, max?: number) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed)) return null;
  if (typeof min === 'number' && parsed < min) return null;
  if (typeof max === 'number' && parsed > max) return null;
  return parsed;
}

function nullableText(value: unknown, maxLength = 240) {
  const text = cleanText(value, maxLength);
  return text || null;
}

function slugify(value: unknown) {
  return cleanText(value, 180)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

function normalizeKey(value: unknown) {
  return cleanText(value, 240)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uuid(value: unknown) {
  const text = cleanText(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

function metadata(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function configurationPageInput(request: Request): ConfigurationPageInput {
  const { searchParams } = new URL(request.url);
  const statusValue = cleanText(searchParams.get('status'), 20);

  return {
    page: integer(searchParams.get('page'), 1) || 1,
    pageSize: integer(searchParams.get('pageSize'), 1, CONFIGURATION_PAGE_SIZE) || CONFIGURATION_PAGE_SIZE,
    search: cleanText(searchParams.get('search'), 120),
    status: ['active', 'inactive'].includes(statusValue) ? statusValue as ConfigurationStatus : 'all'
  };
}

function embeddedCount(value: unknown) {
  if (Array.isArray(value)) return Number(value[0]?.count || 0);
  if (value && typeof value === 'object' && 'count' in value) {
    return Number((value as { count?: number }).count || 0);
  }
  return 0;
}

async function loadConfigurationSearchReferences(
  supabase: ReturnType<typeof getAdminClient>
): Promise<ConfigurationSearchReferences> {
  const [brandsResult, modelsResult, versionsResult, fuelsResult, transmissionsResult] = await Promise.all([
    supabase.from('vehicle_catalog_brands').select('id,normalized_name').limit(2000),
    supabase.from('vehicle_catalog_models').select('id,brand_id,normalized_name').limit(5000),
    supabase.from('vehicle_catalog_versions').select('id,model_id,normalized_name').limit(10000),
    supabase.from('vehicle_catalog_fuels').select('id,normalized_name,code').limit(500),
    supabase.from('vehicle_catalog_transmissions').select('id,normalized_name,code').limit(500)
  ]);

  const results = [brandsResult, modelsResult, versionsResult, fuelsResult, transmissionsResult];
  const firstError = results.find((result) => result.error)?.error;
  if (firstError) throw firstError;

  return {
    brands: brandsResult.data || [],
    models: modelsResult.data || [],
    versions: versionsResult.data || [],
    fuels: fuelsResult.data || [],
    transmissions: transmissionsResult.data || []
  };
}

async function loadConfigurationPage(
  supabase: ReturnType<typeof getAdminClient>,
  input: ConfigurationPageInput,
  providedReferences?: ConfigurationSearchReferences
) {
  const from = (input.page - 1) * input.pageSize;
  const to = from + input.pageSize - 1;
  const normalizedSearch = normalizeKey(input.search);
  const references = normalizedSearch
    ? providedReferences || await loadConfigurationSearchReferences(supabase)
    : providedReferences;

  let query = supabase
    .from('vehicle_catalog_configurations')
    .select(`
      *,
      vehicle_catalog_versions!inner (
        id,
        model_id,
        normalized_name,
        vehicle_catalog_models!inner (
          id,
          brand_id,
          normalized_name,
          vehicle_catalog_brands!inner (id, normalized_name)
        )
      )
    `, { count: 'exact' });

  if (input.status === 'active') query = query.eq('is_active', true);
  if (input.status === 'inactive') query = query.eq('is_active', false);

  if (normalizedSearch && references) {
    const brandNameById = new Map(
      references.brands.map((item) => [String(item.id), String(item.normalized_name || '')])
    );
    const modelById = new Map(references.models.map((item) => [String(item.id), item]));
    const modelSearchText = new Map(
      references.models.map((item) => [
        String(item.id),
        `${brandNameById.get(String(item.brand_id)) || ''} ${item.normalized_name || ''}`.trim()
      ])
    );

    const matchingBrandIds = references.brands
      .filter((item) => String(item.normalized_name || '').includes(normalizedSearch))
      .map((item) => String(item.id));
    const matchingModelIds = references.models
      .filter((item) => (modelSearchText.get(String(item.id)) || '').includes(normalizedSearch))
      .map((item) => String(item.id));
    const matchingVersionIds = references.versions
      .filter((item) => {
        const model = modelById.get(String(item.model_id));
        const hierarchy = `${modelSearchText.get(String(item.model_id)) || ''} ${item.normalized_name || ''}`.trim();
        return Boolean(model) && hierarchy.includes(normalizedSearch);
      })
      .map((item) => String(item.id));
    const matchingFuelIds = references.fuels
      .filter((item) => `${item.normalized_name || ''} ${normalizeKey(item.code)}`.includes(normalizedSearch))
      .map((item) => String(item.id));
    const matchingTransmissionIds = references.transmissions
      .filter((item) => `${item.normalized_name || ''} ${normalizeKey(item.code)}`.includes(normalizedSearch))
      .map((item) => String(item.id));
    const searchedYear = /^\d{4}$/.test(normalizedSearch) ? Number(normalizedSearch) : null;

    if (searchedYear) {
      query = query.or(`manufacture_year.eq.${searchedYear},model_year.eq.${searchedYear}`);
    } else if (matchingBrandIds.length) {
      query = query.in('vehicle_catalog_versions.vehicle_catalog_models.brand_id', matchingBrandIds);
    } else if (matchingFuelIds.length) {
      query = query.in('fuel_id', matchingFuelIds);
    } else if (matchingTransmissionIds.length) {
      query = query.in('transmission_id', matchingTransmissionIds);
    } else if (matchingVersionIds.length && matchingVersionIds.length <= 180) {
      query = query.in('version_id', matchingVersionIds);
    } else if (matchingModelIds.length) {
      query = query.in('vehicle_catalog_versions.model_id', matchingModelIds);
    } else if (matchingVersionIds.length) {
      query = query.ilike('vehicle_catalog_versions.normalized_name', `%${normalizedSearch}%`);
    } else {
      const pattern = `*${normalizedSearch}*`;
      query = query.or([
        `engine_name.ilike.${pattern}`,
        `body_type.ilike.${pattern}`,
        `traction.ilike.${pattern}`,
        `notes.ilike.${pattern}`
      ].join(','));
    }
  }

  const { data, error, count } = await query
    .order('manufacture_year', { ascending: false })
    .order('model_year', { ascending: false })
    .order('id', { ascending: true })
    .range(from, to);

  if (error) throw error;

  const total = count || 0;
  return {
    items: (data || []).map((item: any) => {
      const { vehicle_catalog_versions: _relationship, ...configuration } = item;
      return configuration;
    }),
    pagination: {
      page: input.page,
      page_size: input.pageSize,
      total,
      total_pages: Math.max(1, Math.ceil(total / input.pageSize)),
      from: total ? from + 1 : 0,
      to: total ? Math.min(to + 1, total) : 0,
      search: input.search,
      status: input.status
    }
  };
}

async function ensureUniqueName(
  supabase: ReturnType<typeof getAdminClient>,
  resource: Resource,
  name: unknown,
  parentColumn?: string,
  parentId?: unknown,
  ignoreId?: unknown
) {
  const table = tableByResource[resource];
  const normalized = normalizeKey(name);
  if (!normalized) throw new Error('Informe um nome válido.');

  let query = supabase.from(table).select('id,name').eq('normalized_name', normalized).limit(1);
  if (parentColumn) {
    const parsedParentId = uuid(parentId);
    if (!parsedParentId) throw new Error('Vínculo obrigatório inválido.');
    query = query.eq(parentColumn, parsedParentId);
  }
  const ignored = uuid(ignoreId);
  if (ignored) query = query.neq('id', ignored);

  const { data, error } = await query;
  if (error) throw error;
  if (data?.length) {
    throw new Error(`Já existe um cadastro equivalente: ${data[0].name}.`);
  }
}

async function ensureUniqueAlias(
  supabase: ReturnType<typeof getAdminClient>,
  entityType: unknown,
  alias: unknown,
  ignoreId?: unknown
) {
  const type = cleanText(entityType, 40);
  const normalized = normalizeKey(alias);
  if (!type || !normalized) throw new Error('Informe o tipo e o apelido.');

  let query = supabase
    .from('vehicle_catalog_aliases')
    .select('id,alias,entity_id')
    .eq('entity_type', type)
    .eq('normalized_alias', normalized)
    .limit(1);

  const ignored = uuid(ignoreId);
  if (ignored) query = query.neq('id', ignored);

  const { data, error } = await query;
  if (error) throw error;
  if (data?.length) throw new Error(`Esse apelido já está vinculado: ${data[0].alias}.`);
}

function preparePayload(resource: Resource, body: any, masterId: string, updating = false) {
  const common = {
    is_active: bool(body.is_active, true),
    metadata: metadata(body.metadata),
    updated_by: masterId
  };

  if (!updating) Object.assign(common, { created_by: masterId });

  switch (resource) {
    case 'brands': {
      const name = cleanText(body.name, 120);
      return {
        ...common,
        name,
        slug: slugify(body.slug || name),
        country: nullableText(body.country, 100)
      };
    }
    case 'models':
      return {
        ...common,
        brand_id: uuid(body.brand_id),
        name: cleanText(body.name, 140),
        category: nullableText(body.category, 100),
        start_year: integer(body.start_year, 1886, 2200),
        end_year: integer(body.end_year, 1886, 2200)
      };
    case 'versions':
      return {
        ...common,
        model_id: uuid(body.model_id),
        name: cleanText(body.name, 180),
        engine_name: nullableText(body.engine_name, 120),
        engine_displacement: decimal(body.engine_displacement, 0.1, 20),
        body_type: nullableText(body.body_type, 100),
        doors: integer(body.doors, 1, 8),
        seats: integer(body.seats, 1, 30),
        traction: nullableText(body.traction, 80)
      };
    case 'fuels':
      return {
        ...common,
        name: cleanText(body.name, 80),
        code: nullableText(body.code, 40),
        sort_order: integer(body.sort_order) || 0
      };
    case 'transmissions':
      return {
        ...common,
        name: cleanText(body.name, 100),
        code: nullableText(body.code, 40),
        gears: integer(body.gears, 1, 20),
        notes: nullableText(body.notes, 600),
        sort_order: integer(body.sort_order) || 0
      };
    case 'colors':
      return {
        ...common,
        name: cleanText(body.name, 100),
        base_color: nullableText(body.base_color, 100),
        hex_code: nullableText(body.hex_code, 7),
        sort_order: integer(body.sort_order) || 0
      };
    case 'configurations':
      return {
        ...common,
        version_id: uuid(body.version_id),
        manufacture_year: integer(body.manufacture_year, 1886, 2200),
        model_year: integer(body.model_year, 1886, 2200),
        fuel_id: uuid(body.fuel_id),
        transmission_id: uuid(body.transmission_id),
        engine_name: nullableText(body.engine_name, 120),
        engine_displacement: decimal(body.engine_displacement, 0.1, 20),
        body_type: nullableText(body.body_type, 100),
        traction: nullableText(body.traction, 80),
        doors: integer(body.doors, 1, 8),
        seats: integer(body.seats, 1, 30),
        notes: nullableText(body.notes, 1000)
      };
    case 'aliases':
      return {
        ...common,
        entity_type: cleanText(body.entity_type, 40),
        entity_id: uuid(body.entity_id),
        alias: cleanText(body.alias, 220),
        source: cleanText(body.source || 'master', 80)
      };
    case 'suggestions': {
      const status = cleanText(body.status || 'pending', 40);
      const reviewed = ['approved', 'rejected', 'merged'].includes(status);
      return {
        proposed_entity_type: cleanText(body.proposed_entity_type, 40),
        suggested_name: cleanText(body.suggested_name, 240),
        parent_context: metadata(body.parent_context),
        proposed_payload: metadata(body.proposed_payload),
        source_type: cleanText(body.source_type || 'master', 40),
        source_store_id: uuid(body.source_store_id),
        submitted_by: updating ? undefined : masterId,
        status,
        matched_entity_type: nullableText(body.matched_entity_type, 40),
        matched_entity_id: uuid(body.matched_entity_id),
        reviewed_by: reviewed ? masterId : null,
        review_notes: nullableText(body.review_notes, 1200),
        reviewed_at: reviewed ? new Date().toISOString() : null
      };
    }
  }
}

function stripUndefined<T extends Record<string, any>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

async function validatePayload(resource: Resource, payload: any) {
  if (resource === 'brands' && (!payload.name || !payload.slug)) {
    throw new Error('Nome e slug são obrigatórios.');
  }
  if (resource === 'models' && (!payload.brand_id || !payload.name)) {
    throw new Error('Marca e modelo são obrigatórios.');
  }
  if (resource === 'versions' && (!payload.model_id || !payload.name)) {
    throw new Error('Modelo e versão são obrigatórios.');
  }
  if (resource === 'configurations') {
    if (!payload.version_id || !payload.manufacture_year || !payload.model_year) {
      throw new Error('Versão, ano de fabricação e ano modelo são obrigatórios.');
    }
  }
  if (['fuels', 'transmissions', 'colors'].includes(resource) && !payload.name) {
    throw new Error('Nome é obrigatório.');
  }
  if (resource === 'aliases' && (!payload.entity_type || !payload.entity_id || !payload.alias)) {
    throw new Error('Tipo, destino e apelido são obrigatórios.');
  }
  if (resource === 'suggestions' && (!payload.proposed_entity_type || !payload.suggested_name)) {
    throw new Error('Tipo e nome sugerido são obrigatórios.');
  }
}

async function audit(
  supabase: ReturnType<typeof getAdminClient>,
  master: any,
  action: string,
  resource: Resource,
  id: string,
  oldValue: any,
  newValue: any
) {
  await supabase.from('audit_logs').insert({
    user_id: master.id,
    user_role: 'master',
    action_type: action,
    entity_type: `vehicle_catalog_${resource}`,
    entity_id: id,
    old_value: oldValue || null,
    new_value: newValue || null
  });
}

async function loadSnapshot(
  supabase: ReturnType<typeof getAdminClient>,
  configurationInput: ConfigurationPageInput
) {
  const [
    brandsResult,
    modelsResult,
    versionsResult,
    configurationTotalResult,
    fuelsResult,
    transmissionsResult,
    colorsResult,
    aliasesResult,
    suggestionsResult,
    auditResult
  ] = await Promise.all([
    supabase.from('vehicle_catalog_brands').select('*').order('name').limit(2000),
    supabase.from('vehicle_catalog_models').select('*').order('name').limit(5000),
    supabase
      .from('vehicle_catalog_versions')
      .select('*, configuration_totals:vehicle_catalog_configurations(count)')
      .order('name')
      .limit(10000),
    supabase.from('vehicle_catalog_configurations').select('*', { count: 'exact', head: true }),
    supabase.from('vehicle_catalog_fuels').select('*').order('sort_order').order('name').limit(500),
    supabase.from('vehicle_catalog_transmissions').select('*').order('sort_order').order('name').limit(500),
    supabase.from('vehicle_catalog_colors').select('*').order('sort_order').order('name').limit(1000),
    supabase.from('vehicle_catalog_aliases').select('*').order('entity_type').order('alias').limit(10000),
    supabase.from('vehicle_catalog_suggestions').select('*').order('created_at', { ascending: false }).limit(2000),
    supabase
      .from('audit_logs')
      .select('id,user_id,action_type,entity_type,entity_id,old_value,new_value,created_at')
      .like('entity_type', 'vehicle_catalog_%')
      .order('created_at', { ascending: false })
      .limit(100)
  ]);

  const results = [
    brandsResult,
    modelsResult,
    versionsResult,
    configurationTotalResult,
    fuelsResult,
    transmissionsResult,
    colorsResult,
    aliasesResult,
    suggestionsResult
  ];
  const firstError = results.find((result) => result.error)?.error;
  if (firstError) throw firstError;

  const brands = brandsResult.data || [];
  const models = modelsResult.data || [];
  const versions = versionsResult.data || [];
  const fuels = fuelsResult.data || [];
  const transmissions = transmissionsResult.data || [];
  const colors = colorsResult.data || [];
  const aliases = aliasesResult.data || [];
  const suggestions = suggestionsResult.data || [];

  const modelCount = new Map<string, number>();
  const versionCount = new Map<string, number>();
  const aliasCount = new Map<string, number>();

  models.forEach((item: any) => modelCount.set(item.brand_id, (modelCount.get(item.brand_id) || 0) + 1));
  versions.forEach((item: any) => versionCount.set(item.model_id, (versionCount.get(item.model_id) || 0) + 1));
  aliases.forEach((item: any) => {
    const key = `${item.entity_type}:${item.entity_id}`;
    aliasCount.set(key, (aliasCount.get(key) || 0) + 1);
  });

  const configurationPage = await loadConfigurationPage(supabase, configurationInput, {
    brands,
    models,
    versions,
    fuels,
    transmissions
  });

  return {
    generated_at: new Date().toISOString(),
    summary: {
      brands: brands.length,
      models: models.length,
      versions: versions.length,
      configurations: configurationTotalResult.count || 0,
      aliases: aliases.length,
      pending_suggestions: suggestions.filter((item: any) => ['pending', 'reviewing'].includes(item.status)).length,
      inactive_records: [...brands, ...models, ...versions, ...fuels, ...transmissions, ...colors]
        .filter((item: any) => item.is_active === false).length
    },
    brands: brands.map((item: any) => ({
      ...item,
      models_count: modelCount.get(item.id) || 0,
      aliases_count: aliasCount.get(`brand:${item.id}`) || 0
    })),
    models: models.map((item: any) => ({
      ...item,
      versions_count: versionCount.get(item.id) || 0,
      aliases_count: aliasCount.get(`model:${item.id}`) || 0
    })),
    versions: versions.map((item: any) => {
      const { configuration_totals: configurationTotals, ...version } = item;
      return {
        ...version,
        configurations_count: embeddedCount(configurationTotals),
        aliases_count: aliasCount.get(`version:${item.id}`) || 0
      };
    }),
    configurations: configurationPage.items,
    pagination: configurationPage.pagination,
    fuels: fuels.map((item: any) => ({ ...item, aliases_count: aliasCount.get(`fuel:${item.id}`) || 0 })),
    transmissions: transmissions.map((item: any) => ({ ...item, aliases_count: aliasCount.get(`transmission:${item.id}`) || 0 })),
    colors: colors.map((item: any) => ({ ...item, aliases_count: aliasCount.get(`color:${item.id}`) || 0 })),
    aliases,
    suggestions,
    history: auditResult.error ? [] : auditResult.data || []
  };
}

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) return NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 });

    const input = configurationPageInput(request);
    const { searchParams } = new URL(request.url);
    if (searchParams.get('section') === 'configurations') {
      const page = await loadConfigurationPage(supabase, input);
      return NextResponse.json({
        generated_at: new Date().toISOString(),
        configurations: page.items,
        pagination: page.pagination
      });
    }

    return NextResponse.json(await loadSnapshot(supabase, input));
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível carregar o catálogo.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) return NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 });

    const body = await request.json();
    const resource = asResource(body.resource);
    const payload = stripUndefined(preparePayload(resource, body, master.id, false));
    await validatePayload(resource, payload);

    if (resource === 'brands') await ensureUniqueName(supabase, resource, payload.name);
    if (resource === 'models') await ensureUniqueName(supabase, resource, payload.name, 'brand_id', payload.brand_id);
    if (resource === 'versions') await ensureUniqueName(supabase, resource, payload.name, 'model_id', payload.model_id);
    if (['fuels', 'transmissions', 'colors'].includes(resource)) {
      await ensureUniqueName(supabase, resource, payload.name);
    }
    if (resource === 'aliases') await ensureUniqueAlias(supabase, payload.entity_type, payload.alias);

    const { data, error } = await supabase
      .from(tableByResource[resource])
      .insert(payload)
      .select('*')
      .single();

    if (error) throw error;
    await audit(supabase, master, 'vehicle_catalog_create', resource, data.id, null, data);

    return NextResponse.json({ ok: true, record: data }, { status: 201 });
  } catch (error: any) {
    const duplicate = error?.code === '23505';
    return NextResponse.json(
      { error: duplicate ? 'Já existe um cadastro igual ou equivalente.' : error?.message || 'Não foi possível cadastrar.' },
      { status: duplicate ? 409 : 400 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = getAdminClient();
    const master = await requireMaster(request, supabase);
    if (!master) return NextResponse.json({ error: 'Acesso restrito ao perfil Master.' }, { status: 403 });

    const body = await request.json();
    const resource = asResource(body.resource);
    const id = uuid(body.id);
    if (!id) return NextResponse.json({ error: 'Cadastro inválido.' }, { status: 400 });

    const table = tableByResource[resource];
    const { data: current, error: currentError } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
    if (currentError) throw currentError;
    if (!current) return NextResponse.json({ error: 'Cadastro não encontrado.' }, { status: 404 });

    const payload = stripUndefined(preparePayload(resource, { ...current, ...body }, master.id, true));
    delete (payload as any).created_by;
    await validatePayload(resource, payload);

    if (resource === 'brands') await ensureUniqueName(supabase, resource, payload.name, undefined, undefined, id);
    if (resource === 'models') await ensureUniqueName(supabase, resource, payload.name, 'brand_id', payload.brand_id, id);
    if (resource === 'versions') await ensureUniqueName(supabase, resource, payload.name, 'model_id', payload.model_id, id);
    if (['fuels', 'transmissions', 'colors'].includes(resource)) {
      await ensureUniqueName(supabase, resource, payload.name, undefined, undefined, id);
    }
    if (resource === 'aliases') await ensureUniqueAlias(supabase, payload.entity_type, payload.alias, id);

    const { data, error } = await supabase.from(table).update(payload).eq('id', id).select('*').single();
    if (error) throw error;

    await audit(supabase, master, 'vehicle_catalog_update', resource, id, current, data);
    return NextResponse.json({ ok: true, record: data });
  } catch (error: any) {
    const duplicate = error?.code === '23505';
    return NextResponse.json(
      { error: duplicate ? 'Já existe um cadastro igual ou equivalente.' : error?.message || 'Não foi possível atualizar.' },
      { status: duplicate ? 409 : 400 }
    );
  }
}
