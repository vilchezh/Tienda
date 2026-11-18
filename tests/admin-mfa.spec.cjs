const {test,expect}=require('@playwright/test');
const {setup}=require('./helpers.cjs');

test('admin with verified TOTP factor cannot view private data until completing MFA',async({page})=>{
 const state=await setup(page,{authenticated:true});
 const factor={id:'11111111-1111-4111-8111-111111111111',status:'verified',factor_type:'totp',friendly_name:'Prueba sandbox'};
 await page.route('**/auth/v1/factors',route=>route.fulfill({json:{all:[factor],totp:[factor],phone:[]}}));
 await page.goto('/admin.html');
 await expect(page.locator('#adminMfaLoginPanel')).toBeVisible();
 await expect(page.locator('#mainAdmin')).toBeHidden();
 expect(state.reads.filter(x=>x.includes('/rest/v1/productos'))).toHaveLength(0);
 expect(state.orderQueries).toHaveLength(0);
 expect(state.errors).toEqual([]);
});
