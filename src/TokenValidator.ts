import { Logger } from "pino";
import type { JwksStore } from "@titorelli-org/jwks-store";
import { everyAsync } from "./everyAsync";
import {
  compactDecrypt,
  compactVerify,
  decodeJwt,
  decodeProtectedHeader,
} from "jose";
import { someAsync } from "./someAsync";

export class TokenValidator {
  private readonly jwksStore: JwksStore;
  private readonly testSubjectImpl: (sub: string) => boolean | Promise<boolean>;
  private readonly testAudienceImpl: (
    aud: string,
    url: string,
  ) => boolean | Promise<boolean>;
  private readonly logger: Logger;

  constructor({
    jwksStore,
    testSubject,
    testAudience,
    logger,
  }: {
    jwksStore: JwksStore;
    testSubject: TokenValidator["testSubjectImpl"];
    testAudience: TokenValidator["testAudienceImpl"];
    logger: Logger;
  }) {
    this.jwksStore = jwksStore;
    this.testSubjectImpl = testSubject;
    this.testAudienceImpl = testAudience;
    this.logger = logger;
  }

  public async validate(tokenStr: string, url: string, scopes: string[]) {
    try {
      const { sub, exp, aud } = await this.parseToken(tokenStr);

      return everyAsync(
        [
          this.isNotExpired(exp),
          this.isSubjectExists(sub),
          this.isAudienceMatch(aud, url),
          this.isScopesMatch(scopes),
        ],
        Boolean,
      );
    } catch (e) {
      this.logger.error(e);

      return false;
    }
  }

  private async parseToken(tokenStr: string) {
    const protectedHeader = decodeProtectedHeader(tokenStr);

    function stripPrivate(jwk) {
      const { d, p, q, dp, dq, qi, oth, ...pub } = jwk;
      return pub;
    }

    const key = await this.jwksStore.selectForVerify(
      protectedHeader.alg,
      protectedHeader.kid,
    );

    await compactVerify(tokenStr, stripPrivate(key), {
      algorithms: [protectedHeader.alg],
    });

    return decodeJwt(tokenStr);
  }

  private isNotExpired(exp: number) {
    return true;
  }

  private async isSubjectExists(sub: string) {
    try {
      return await this.testSubjectImpl(sub);
    } catch (e) {
      this.logger.error(e);

      return false;
    }
  }

  private async isAudienceMatch(aud: string | string[], url: string) {
    try {
      return await someAsync(
        [aud].flat().map((aud) => this.testAudienceImpl(aud, url)),
        Boolean,
      );
    } catch (e) {
      this.logger.error(e);

      return false;
    }
  }

  private isScopesMatch(scopes: string[]) {
    return true;
  }
}
