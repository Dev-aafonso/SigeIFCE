import {
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';

export const HtmxRequest = createParamDecorator(
  (
    _data: unknown,
    ctx: ExecutionContext,
  ): boolean => {

    const request =
      ctx.switchToHttp().getRequest();

    return request.headers['hx-request'] === 'true';
  },
);
