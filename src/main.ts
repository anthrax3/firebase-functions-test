// The MIT License (MIT)
//
// Copyright (c) 2018 Firebase
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import { has, merge, random, get } from 'lodash';

import { CloudFunction, EventContext, Resource, Change } from 'firebase-functions';

/** Fields of the event context that can be overridden/customized. */
export type EventContextOptions = {
  /** ID of the event. If omitted, a random ID will be generated. */
  eventId?: string;
  /** ISO time string of when the event occurred. If omitted, the current time is used. */
  timestamp?: string;
  /** The values for the wildcards in the reference path that a database or Firestore function is listening to.
   * If omitted, random values will be generated.
   */
  params?: { [option: string]: any };
  /** (Only for database functions.) Firebase auth variable representing the user that triggered
   *  the function. Defaults to null.
   */
  auth?: any;
  /** (Only for database functions.) The authentication state of the user that triggered the function.
   * Default is 'UNAUTHENTICATED'.
   */
  authType?: 'ADMIN' | 'USER' | 'UNAUTHENTICATED';
};

/** A function that can be called with test data and optional override values for the event context.
 * It will subsequently invoke the cloud function it wraps with the provided test data and a generated event context.
 */
export type WrappedFunction = (data: any, options?: EventContextOptions) => any | Promise<any>;

/** Takes a cloud function to be tested, and returns a WrappedFunction which can be called in test code. */
export function wrap<T>(cloudFunction: CloudFunction<T>): WrappedFunction {
  if (!has(cloudFunction, '__trigger')) {
    throw new Error('Wrap can only be called on functions written with the firebase-functions SDK.');
  }
  if (!has(cloudFunction, '__trigger.eventTrigger')) {
    throw new Error('Wrap function is only available for non-HTTP functions.');
  }
  if (!has(cloudFunction, 'run')) {
    throw new Error('This library can only be used with functions written with firebase-functions v1.0.0 and above');
  }
  let wrapped: WrappedFunction = (data: T, options: EventContextOptions) => {
    const defaultContext: EventContext = {
      eventId: _makeEventId(),
      resource: {
        service: cloudFunction.__trigger.eventTrigger.service,
        name: _makeResourceName(cloudFunction.__trigger.eventTrigger.resource, options? options.params: null),
      },
      eventType: cloudFunction.__trigger.eventTrigger.eventType,
      timestamp: (new Date()).toISOString(),
      params: {},
    };
    if (defaultContext.eventType.match(/firebase.database/)) {
      defaultContext.authType = 'UNAUTHENTICATED';
      defaultContext.auth = null;
    }
    let context = merge({}, defaultContext, options);
    return cloudFunction.run(
      data,
      context,
    );
  };
  return wrapped;
}

/** @internal */
export function _makeResourceName(triggerResource: string, params = {}): string {
  const wildcardRegex = new RegExp('{[^/{}]*}', 'g');
  let resourceName = triggerResource.replace(wildcardRegex, (wildcard) => {
    let wildcardNoBraces = wildcard.slice(1, -1); // .slice removes '{' and '}' from wildcard
    let sub = get(params, wildcardNoBraces);
    return sub || wildcardNoBraces + random(1, 9);
  });
  return resourceName;
}

function _makeEventId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/** Make a Change object to be used as test data for Firestore and real time database onWrite and onUpdate functions. */
export function makeChange<T>(before: T, after: T): Change<T> {
  return Change.fromObjects(before, after);
}

/** Mock values returned by `functions.config()`. */
export function mockConfig(config: { [key: string]: { [key: string]: any } }) {
  process.env.CLOUD_RUNTIME_CONFIG = JSON.stringify(config);
}
