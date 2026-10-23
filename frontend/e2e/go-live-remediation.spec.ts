import { expect, test } from '@playwright/test';
import { mockShellSession } from './helpers/shell-session';

test('DOC reload finds assigned drivers independently of actionable queue and can reassign', async ({ page }) => {
 await mockShellSession(page);
 let driver = '1234';
 let lookupCalls = 0;
 await page.route('**/api/**', async route => {
  const url = new URL(route.request().url());
  if (url.pathname.endsWith('/auth/me')) return route.fulfill({json: {id:'doc-local', name:'DOC local', role:'doc_officer', is_admin:false}});
  const row = { id:'assigned-dock', status:'DOCKING', cluster:'Assigned North', dock_no:'1', driver_id:driver, plate_number:'LOCAL-1', truck_size:'6W', truck_type:'WETLEASE', backlogs:1, created_at:'2026-10-12T00:00:00Z', request_timestamp:'2026-10-12T00:00:00Z' };
  if (url.pathname.endsWith('/requests/assigned-dock/reassign-driver')) {
   driver = route.request().postDataJSON().driver_id;
   return route.fulfill({json:{...row, driver_id:driver}});
  }
  if (url.pathname.endsWith('/requests') && url.searchParams.get('status') === 'DOCKING') {
   lookupCalls++;
   expect(url.searchParams.get('per_page')).toBe('20');
   return route.fulfill({json:{data:[row],current_page:1,last_page:1,per_page:20,total:1}});
  }
  return route.fulfill({json:{data:[],current_page:1,last_page:1,per_page:20,total:0,count:0}});
 });
 await page.goto('/docking');
 await expect(page.getByText('No trucks are waiting for docking.')).toBeVisible();
 await page.reload();
 const lookup = page.getByRole('region', {name:'Assigned driver lookup', exact:true});
 await expect(lookup.getByText('Assigned North')).toBeVisible();
 await lookup.getByRole('button', {name:'Reassign Driver ID'}).click();
 const dialog = page.getByRole('dialog', {name:'Reassign Driver ID for Assigned North'});
 await dialog.getByRole('textbox', {name:'Driver ID'}).fill('5678');
 await page.evaluate(async () => {
  const load = new Function('return import("/src/lib/supabase.ts")');
  const {supabase} = await load();
  await supabase.auth._notifyAllSubscribers('TOKEN_REFRESHED', {access_token:'synthetic-refreshed-doc',user:{id:'doc-local'}});
 });
 await expect(dialog.getByRole('textbox', {name:'Driver ID'})).toHaveValue('5678');
 await dialog.getByRole('button', {name:'Reassigned', exact:true}).click();
 await expect(page.getByRole('dialog', {name:'Printable truck label'}).locator('[data-label-field="driver"]')).toContainText('5678');
 expect(driver).toBe('5678');
 expect(lookupCalls).toBeGreaterThanOrEqual(2);
});

test('account replacement hides private data before failed profile lookup and logout preview stays clean', async ({ page }) => {
 await mockShellSession(page);
 let rejectProfile = false;
 let secondAccount = false;
 await page.route('**/api/**', async route => {
  const url = new URL(route.request().url());
  if (url.pathname.endsWith('/auth/me')) return route.fulfill(rejectProfile ? {status:403,json:{message:'Replacement denied'}} : {json:{id:secondAccount ? 'second-account' : 'first-account',name:secondAccount ? 'Second account' : 'First account',role:'ops_pic',is_admin:false}});
  if (url.pathname.endsWith('/requests') && secondAccount) return route.fulfill({status:403,json:{message:'Replacement records denied'}});
  if (url.pathname.endsWith('/requests')) return route.fulfill({json:{data:[{id:'private-first',cluster:'PRIVATE FIRST ACCOUNT',status:'DOCKING',driver_id:'1234',plate_number:'PRIVATE-PLATE',dock_no:'1',backlogs:1,truck_size:'6W',truck_type:'WETLEASE',request_timestamp:'2026-10-12T00:00:00Z'}],current_page:1,last_page:1,total:1,per_page:20}});
  return route.fulfill({json:{data:[],count:0,metrics:{total:1,by_status:{}},analytics:{truck_sizes:{},hourly:[]}}});
 });
 await page.goto('/dashboard');
 await expect(page.getByText('PRIVATE FIRST ACCOUNT').first()).toBeVisible();
 secondAccount = true;
 await page.evaluate(async () => {
  // Local-only auth event injection: no provider session or credentials are used.
  const load = new Function('return import("/src/lib/supabase.ts")');
  const {supabase} = await load();
  await supabase.auth._notifyAllSubscribers('SIGNED_IN', {access_token:'synthetic-second-account'});
 });
 await expect(page.getByText('PRIVATE FIRST ACCOUNT')).toHaveCount(0);
 await expect(page.getByText('Second account').first()).toBeVisible();
 rejectProfile = true;
 await page.evaluate(async () => {
  const load = new Function('return import("/src/lib/supabase.ts")');
  const {supabase} = await load();
  await supabase.auth._notifyAllSubscribers('SIGNED_IN', {access_token:'synthetic-third-account'});
 });
 await expect(page.getByRole('heading', {name:'Account not provisioned'})).toBeVisible();
 await page.evaluate(async () => {
  const load = new Function('return import("/src/lib/supabase.ts")');
  const {supabase} = await load();
  await supabase.auth._notifyAllSubscribers('SIGNED_OUT', null);
 });
 await expect(page.getByText('PRIVATE FIRST ACCOUNT')).toHaveCount(0);
 await expect(page.locator('.dashboard-preview')).toBeVisible();
 await expect(page.getByText('PRIVATE-PLATE')).toHaveCount(0);
});


test('FTE can issue a DOC one-time recovery password', async ({ page }) => {
 await mockShellSession(page);
 let resetId = '';
 await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (path.endsWith('/auth/me')) return route.fulfill({json:{id:'fte-local',name:'FTE local',role:'fte_ops',is_admin:false}});
  if (path.endsWith('/users/doc-local/reset-password')) {
   expect(route.request().method()).toBe('POST'); resetId = 'doc-local';
   return route.fulfill({json:{initial_password:'local-one-time-password'}});
  }
  if (path.endsWith('/users')) return route.fulfill({json:{data:[{id:'doc-local',name:'DOC recovery',role:'doc_officer',is_active:true}]}});
  return route.fulfill({json:{data:[],count:0}});
 });
 await page.goto('/users');
 await page.getByRole('button', {name:'Reset password for DOC recovery'}).click();
 await page.getByRole('dialog', {name:'Reset user password'}).getByRole('button', {name:'Reset password',exact:true}).click();
 await expect(page.getByRole('dialog', {name:'One-time password issued'})).toContainText('local-one-time-password');
 expect(resetId).toBe('doc-local');
});
