import Provider, { type Configuration } from "oidc-provider";
import { findAccount } from "../db/user";
import appConfig from "../util/config";
import { KnexAdapter } from "./adapter";

// Do not allow any oidc-provider errors to redirect back to redirect_uri of client
import { errors } from 'oidc-provider';
import { generate } from "generate-password";
import { REDIRECT_PATHS } from "@shared/constants";
let e: keyof typeof errors
for (e in errors) {
  Object.defineProperty(errors[e].prototype, 'allow_redirect', { value: false });
}


const configuration: Configuration = {
  features: {
    devInteractions: {
      enabled: false
    },
    backchannelLogout: {
      enabled: true
    },
    revocation: {
      enabled: true
    },
    rpInitiatedLogout: {
      // custom logout question page
      logoutSource: (ctx, form) => {
        // parse out secret value so static frontend can use
        const secret = /value=\"(\w*)\"/.exec(form)
        ctx.redirect(`/${REDIRECT_PATHS.LOGOUT}${secret?.[1] ? `/${secret[1]}` : ''}`)
      },
      postLogoutSuccessSource: (ctx) => {
        // TODO: custom logout success page?
        ctx.redirect("/")
      }
    }
  },
  interactions: {
    url: (ctx, interaction) => {
      return `/api/interaction`
    }
  },
  cookies: {
    // TODO: generate secret value for this
    keys: ["test"],
    long: {
      signed: true,
    },
    short: {
      signed: true,
    }
  },
  jwks: {
    // TODO: get keys from DB
    keys: [
      {
        kty: 'RSA',
        n: 'jw3bixcae4ktBdXYcKeK5J7pmsXvQdvuOB8yv_q426tsMDlTZ1jj9CgYEZF_SCfzwQ5pcogLD-WY-LYJtt8zfjU_mWZZWcbR1QcMIWhLsSdi2OSlksIewMiv5CzvDBzs6h9sU0yr6yY6SYmT89jXU-D0MqSakDR0x0tyVUonGAWiVGJYINCCEbonoqFYAXjKdrNCCIliXiWQS6rajkEEXj0I2uQr4L1S80mSWWvDfFmFw4yC7V9nOGf1OPotscLCpT7vzlhHCuh3rY12bTEceZeARQ9G9aWQMBhQZPIPBvLdTRl5smFByFJ_FWs2yXXdHXFRo2L8UgwV2D4qVlgUXw',
        e: 'AQAB',
        d: 'PodKHUPd-X1-RnywfJ1fIosrhNFbwSfGupU4c529y5bkVTfZcuTxzrjvvE4imoGMFCiegsdgPnSXJq87E8oAEfxobj7Ec29qLHlGHhweabLTjAZ1MO7UzmNqLoxNeLfz_mn5yXdL9h7hf185Ym63wBwl4TT9smabXLlnokwlRmQXL-FWN5P50X60XgPG9hbv5BGPCrfbNNkLzae3fVeTfAZUYw-rwfrKN_HVUz78lo3cNhE2AVMnIF2CeZeH1xrUC81MWGJi7W1R1MtMTUObdqCpqLMtoWSojF3UT0pOMCiMeEt25EGpMiRVNy8HQD-z92uBEh8n2DYWb8Fou1Wa0Q',
        p: '23oJTOlWauw_fQJxBmwkfzPL_j9p_Fjtf_ThESn4ZpCkl2Y5cKSqc70bBP3SkgKRWWIt8QunkmkSHDmVzu0_UQu7YgCxqwwR8TvK8uCgNw8umtE_2w2fvf8l_863TEg4btz87kMtk01vWRUcqQxlBvd-bTmL8FDm0iblkskSpbs',
        q: 'ptwhZzh1TkXFiglDz04_dC6s-Ek_qRxTtUSdhaRr7UDzpa_mEEd41m3kgmjgIlK-FgDpf66N4OWHQow76PVtRUAQSZDSPo4k8TNs5AY_oyzIBAWBnakfs8L368Vo4O3RZJ4wiMqnphTRGiM6rLOev74uTILcVnPgDZLbAm2Gb60',
        dp: 'QDjIienpcKYqucDCI_f3AgW9Fmul7sJy1LNqPGSEnDaNAwRVoIF-oxld06sWN8VqlLYm7VbUtQHr27h5_q_rjCKbtUSwuHVytp0heMqD9ziJEaJTRh0JdkY370-k0Tx8zuv5UxrzNhw9jdqgpVLMKSq4outo6Gwz7qCVIsuVmks',
        dq: 'FHPNAFryPfrdYLMMBcAAlRwXhYNs8yyOshxL9pKVzAn3E2sBFyO7kwT7SmTSfEKKHCZWeJkLuPJJZwXLXh2fHCrjFDFVI-fGbW4xPa3qZPTbO2r1XT7arO0L-HFFDrT3wo6FQm8cp4XLr5l72qlVnwkPob80hMBFSUSj5aNJJC0',
        qi: 'MJJ6KTrCdq1gEgH-MpDF4DeXhE_dlB1P2am3juUR8ieZmohWbruBo6vmA_9Fm_lUs6V3qZ7gjbszguQZwcIFnvXceOBMH35_8TQLM3IrnNTJJTyWslrH3rdLAsIPk_x0cgIJ_gC0BHiQ9TfW8mKjGAK0JRv-V8XXnT4ZFQrlmQI',
      },
    ],
  },
  clients: [
    {
      client_id: "unknown_auth_internal_client",
      client_secret: generate({
        length: 32,
        numbers: true
      }), // unique every time, never used
      redirect_uris: [`${appConfig.APP_DOMAIN}/api/status`],
      response_types: ["none"],
      scope: "openid",
    },
  ],
  claims: {
    // OIDC 1.0 Standard
    // address: ['address'],
    email: ['email', 'email_verified'],
    // phone: ['phone_number', 'phone_number_verified'],
    profile: [
      // 'birthdate', 
      // 'family_name', 
      // 'gender', 
      // 'given_name', 
      // 'locale', 
      // 'middle_name', 
      'name',
      // 'nickname', 
      // 'picture', 
      'preferred_username',
      // 'profile', 
      // 'updated_at', 
      // 'website', 
      // 'zoneinfo'
    ],

    // Additional
    groups: ["groups"]
  },
  pkce: {
    methods: ["S256"],
    required: () => false
  },
  renderError: (ctx, out, error) => {
    ctx.status = 500
    ctx.body = {
      error: out
    }
  },
  clientBasedCORS: () => true,
  findAccount: findAccount,
  adapter: KnexAdapter
}

export const provider = new Provider(`${appConfig.APP_DOMAIN}/oidc`, configuration)