import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus, ExecutionContext, CallHandler } from '@nestjs/common';
import request from 'supertest';
import { MorganModule } from 'nest-morgan';
import { ACGuard } from 'nest-access-control';
import { DefaultAuthGuard } from '../auth/default-auth.guard';
import { ACLModule } from '../access-control/acl.module';
import { AclFilterResponseInterceptor } from '../access-control/interceptors/acl-filter-response.interceptor';
import { AclValidateRequestInterceptor } from '../access-control/interceptors/acl-validate-request.interceptor';

import { WorkflowControllerExternal } from './workflow.controller.external';
import { WorkflowService } from './workflow.service';
import { CompleteWorkflowData } from './types';
import { WorkflowDefinition, WorkflowRuntimeData } from '@prisma/client';

const basicAuthGuard = {
  canActivate: (context: ExecutionContext) => {
    const argumentHost = context.switchToHttp();
    const request: { user: { roles: string[] } } = argumentHost.getRequest();
    request.user = {
      roles: ['operator'],
    };
    return true;
  },
};

const acGuard = {
  canActivate: () => {
    return true;
  },
};

const aclFilterResponseInterceptor = {
  intercept: (_context: ExecutionContext, next: CallHandler) => {
    return next.handle();
  },
};
const aclValidateRequestInterceptor = {
  intercept: (_context: ExecutionContext, next: CallHandler) => {
    return next.handle();
  },
};

describe('Workflow (external)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let wfService: WorkflowService;

  beforeEach(async () => {
    wfService = {
      listFullWorkflowDataByUserId: jest.fn() as unknown,
      getWorkflowRuntimeDataById: jest.fn() as unknown,
      getWorkflowDefinitionById: jest.fn() as unknown,
    } as WorkflowService;

    moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: WorkflowService,
          useValue: wfService,
        },
      ],
      controllers: [WorkflowControllerExternal],
      imports: [MorganModule.forRoot(), ACLModule],
    })
      .overrideGuard(DefaultAuthGuard)
      .useValue(basicAuthGuard)
      .overrideGuard(ACGuard)
      .useValue(acGuard)
      .overrideInterceptor(AclFilterResponseInterceptor)
      .useValue(aclFilterResponseInterceptor)
      .overrideInterceptor(AclValidateRequestInterceptor)
      .useValue(aclValidateRequestInterceptor)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  test('GET /workflows will return a two-key object containing "definition" and "runtime data"  ', async () => {
    const wfService = moduleRef.get<WorkflowService>(WorkflowService);
    (wfService.listFullWorkflowDataByUserId as jest.Mock).mockReturnValue(
      Promise.resolve([
        {
          workflowDefinition: { id: 'a' },
          state: { id: 'b' } as unknown,
        },
      ] as CompleteWorkflowData[]),
    );

    await request(app.getHttpServer())
      .get('/external/workflows')
      .expect(HttpStatus.OK)
      .expect([
        {
          workflowDefinition: { id: 'a' },
          workflowRuntimeData: {
            state: { id: 'b' },
          },
        },
      ]);
  });

  test('GET /workflows/:id non existing', async () => {
    const wfService = moduleRef.get<WorkflowService>(WorkflowService);
    (wfService.getWorkflowRuntimeDataById as jest.Mock).mockReturnValue(Promise.resolve(undefined));

    await request(app.getHttpServer())
      .get(`/external/workflows/abcde`)
      .expect(HttpStatus.NOT_FOUND)
      .expect({
        statusCode: 404,
        message: 'No resource with id [abcde] was found',
        error: 'Not Found',
      });
  });

  test('GET /workflows/:id existing', async () => {
    const wfService = moduleRef.get<WorkflowService>(WorkflowService);

    (wfService.getWorkflowRuntimeDataById as jest.Mock).mockReturnValue(
      Promise.resolve({
        state: { id: 'b' } as unknown,
      } as WorkflowRuntimeData),
    );
    (wfService.getWorkflowDefinitionById as jest.Mock).mockReturnValue(
      Promise.resolve({ id: 'a' } as WorkflowDefinition),
    );
    await request(app.getHttpServer())
      .get(`${'/external/workflows'}/abcde`)
      .expect(HttpStatus.OK)
      .expect({
        workflowDefinition: { id: 'a' },
        workflowRuntimeData: { state: { id: 'b' } },
      });
  });

  afterAll(async () => {
    await app.close();
  });
});
