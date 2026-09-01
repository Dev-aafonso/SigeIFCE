import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';

import { Observable } from 'rxjs';

@Injectable()
export class HtmxInterceptor
  implements NestInterceptor
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<any> {

    const request =
      context.switchToHttp().getRequest();

    const response =
      context.switchToHttp().getResponse();

    const isHtmx =
      request.headers['hx-request'] === 'true';

    if (isHtmx) {
      response.locals.isHtmx = true;
    } else {
      response.locals.isHtmx = false;
    }

    return next.handle();
  }
}
