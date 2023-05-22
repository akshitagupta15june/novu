import { expect } from 'chai';
import * as sinon from 'sinon';

import { UserSession } from '@novu/testing';
import { NotificationTemplateRepository, EnvironmentRepository } from '@novu/dal';
import { GroupedBlueprintResponse } from '../dto/grouped-blueprint.response.dto';
import { CreateNotificationTemplateRequestDto } from '../../notification-template/dto';
import { EmailBlockTypeEnum, FilterPartTypeEnum, INotificationTemplate, StepTypeEnum } from '@novu/shared';
import { GetGroupedBlueprints, POPULAR_TEMPLATES_GROUPED } from '../usecases/get-grouped-blueprints';
import * as blueprintStaticModule from '../usecases/get-grouped-blueprints/consts';
import { MOCK_POPULAR_TEMPLATES_GROUPED } from './consts';
import {
  buildGroupedBlueprintsKey,
  CacheService,
  InMemoryProviderService,
  InvalidateCacheService,
} from '@novu/application-generic';

describe('Get grouped notification template blueprints - /blueprints/group-by-category (GET)', async () => {
  let session: UserSession;
  const notificationTemplateRepository: NotificationTemplateRepository = new NotificationTemplateRepository();
  const environmentRepository: EnvironmentRepository = new EnvironmentRepository();

  const inMemoryProviderService = new InMemoryProviderService();
  const invalidateCache = new InvalidateCacheService(new CacheService(inMemoryProviderService));

  let getGroupedBlueprints: GetGroupedBlueprints;
  let indexModuleStub: sinon.SinonStub;

  before(async () => {
    session = new UserSession();
    await session.initialize();

    getGroupedBlueprints = new GetGroupedBlueprints(new NotificationTemplateRepository());
    indexModuleStub = sinon.stub(blueprintStaticModule, 'POPULAR_TEMPLATES_GROUPED');
  });

  afterEach(() => {
    indexModuleStub.restore();
  });

  it('should get the grouped blueprints', async function () {
    const prodEnv = await getProductionEnvironment();

    await createTemplateFromBlueprint({ session, notificationTemplateRepository, prodEnv });

    const data = await session.testAgent.get(`/v1/blueprints/group-by-category`).send();

    expect(data.statusCode).to.equal(200);

    const groupedBlueprints = (data.body.data as GroupedBlueprintResponse).general;

    expect(groupedBlueprints[0]?.name).to.equal('General');

    for (const group of groupedBlueprints) {
      for (const blueprint of group.blueprints) {
        expect(blueprint.isBlueprint).to.equal(true);
        expect(blueprint.name).to.equal('test email template');
        expect(blueprint.description).to.equal('This is a test description');
        expect(blueprint.active).to.equal(false);
        expect(blueprint.critical).to.equal(false);
        expect(blueprint.steps).to.be.exist;
        expect(blueprint.steps[0].active).to.equal(true);
        expect(blueprint.steps[0].template).to.exist;
        expect(blueprint.steps[0].template?.name).to.be.equal('Message Name');
        expect(blueprint.steps[0].template?.subject).to.be.equal('Test email subject');
      }
    }
  });

  it('should get the updated grouped blueprints (after invalidation)', async function () {
    const prodEnv = await getProductionEnvironment();

    await createTemplateFromBlueprint({
      session,
      notificationTemplateRepository,
      prodEnv,
    });

    const data = await session.testAgent.get(`/v1/blueprints/group-by-category`).send();

    expect(data.statusCode).to.equal(200);

    const groupedBlueprints = (data.body.data as GroupedBlueprintResponse).general;

    expect(groupedBlueprints.length).to.equal(1);
    expect(groupedBlueprints[0].name).to.equal('General');

    const categoryName = 'Life Style';
    await updateBlueprintCategory({ categoryName });

    let updatedGroupedBluePrints = await session.testAgent.get(`/v1/blueprints/group-by-category`).send();

    updatedGroupedBluePrints = (updatedGroupedBluePrints.body.data as GroupedBlueprintResponse).general;

    expect(updatedGroupedBluePrints.length).to.equal(2);
    expect(updatedGroupedBluePrints[0].name).to.equal('General');
    expect(updatedGroupedBluePrints[1].name).to.equal(categoryName);
  });

  it('should get the popular blueprints', async function () {
    const prodEnv = await getProductionEnvironment();

    await createTemplateFromBlueprint({ session, notificationTemplateRepository, prodEnv });

    const data = await session.testAgent.get(`/v1/blueprints/group-by-category`).send();

    expect(data.statusCode).to.equal(200);

    const groupedPopularBlueprints = (data.body.data as GroupedBlueprintResponse).popular;

    expect(groupedPopularBlueprints.name).to.equal('Popular');

    // validate all templates are blueprint
    for (const blueprint of groupedPopularBlueprints.blueprints) {
      expect(blueprint.isBlueprint).to.equal(true);
    }

    // validate blueprint have valid params
    expect(groupedPopularBlueprints.blueprints[0].name).to.equal(':fa-regular fa-message: Comments');
    expect(groupedPopularBlueprints.blueprints[0].description).to.equal(
      'Lorem ipsum dolor sit amet consectetur adipisicing elit. Cupiditate quas totam quod beatae. Ipsam quasi fugiat commodi adipisci eligendi necessitatibus cumque aliquam, dicta natus cupiditate suscipit voluptatum rerum debitis. Ipsum!'
    );
    expect(groupedPopularBlueprints.blueprints[0].steps).to.exist;

    // validate blueprint step have valid params
    expect(groupedPopularBlueprints.blueprints[0].steps[0].name).to.equal('Digest');
    expect(groupedPopularBlueprints.blueprints[0].steps[0].template).to.exist;
    expect(groupedPopularBlueprints.blueprints[0].steps[0].template?.type).to.equal(StepTypeEnum.DIGEST);
    expect(groupedPopularBlueprints.blueprints[0].steps[0].template?.content).to.equal('');
  });

  it('should return mocked POPULAR_TEMPLATES_GROUPED', async () => {
    process.env.BLUEPRINT_CREATOR = session.organization._id;

    const mockedValue = MOCK_POPULAR_TEMPLATES_GROUPED;
    indexModuleStub.value(mockedValue);

    const data = await session.testAgent.get(`/v1/blueprints/group-by-category`).send();

    expect(data.statusCode).to.equal(200);

    const groupedPopularBlueprints = (data.body.data as GroupedBlueprintResponse).popular;

    expect(groupedPopularBlueprints).to.deep.equal(mockedValue);
  });

  it('should update the static POPULAR_TEMPLATES_GROUPED with fresh data', async () => {
    const prodEnv = await getProductionEnvironment();
    await createTemplateFromBlueprint({ session, notificationTemplateRepository, prodEnv });

    const data = await session.testAgent.get(`/v1/blueprints/group-by-category`).send();

    const groupedPopularBlueprints = data.body.data as GroupedBlueprintResponse;

    const blueprintFromDb = groupedPopularBlueprints.general[0].blueprints[0];

    // switch id from db store - to mock blueprint id
    const storeBlueprintTemplateId = blueprintFromDb._id?.toString();
    const mockedValue = MOCK_POPULAR_TEMPLATES_GROUPED;
    mockedValue.blueprints[0]._id = storeBlueprintTemplateId;

    indexModuleStub.value(mockedValue);

    await invalidateCache.invalidateByKey({
      key: buildGroupedBlueprintsKey(),
    });

    const updatedBlueprintFromDb = (await session.testAgent.get(`/v1/blueprints/group-by-category`).send()).body.data
      .popular.blueprints[0] as INotificationTemplate;

    expect(updatedBlueprintFromDb).to.deep.equal(blueprintFromDb);
  });

  async function updateBlueprintCategory({ categoryName }: { categoryName: string }) {
    const { body: notificationGroupsResult } = await session.testAgent
      .post(`/v1/notification-groups`)
      .send({ name: categoryName });

    await session.testAgent
      .post(`/v1/notification-templates`)
      .send({ notificationGroupId: notificationGroupsResult.data._id, name: 'test email template', steps: [] });

    await session.applyChanges({
      enabled: false,
    });
  }

  async function getProductionEnvironment() {
    return await environmentRepository.findOne({
      _parentId: session.environment._id,
    });
  }
});

export async function createTemplateFromBlueprint({
  session,
  notificationTemplateRepository,
  prodEnv,
}: {
  session: UserSession;
  notificationTemplateRepository: NotificationTemplateRepository;
  prodEnv;
}) {
  const testTemplateRequestDto: Partial<CreateNotificationTemplateRequestDto> = {
    name: 'test email template',
    description: 'This is a test description',
    tags: ['test-tag'],
    notificationGroupId: session.notificationGroups[0]._id,
    steps: [
      {
        template: {
          name: 'Message Name',
          subject: 'Test email subject',
          preheader: 'Test email preheader',
          content: [{ type: EmailBlockTypeEnum.TEXT, content: 'This is a sample text block' }],
          type: StepTypeEnum.EMAIL,
        },
        filters: [
          {
            isNegated: false,
            type: 'GROUP',
            value: 'AND',
            children: [
              {
                on: FilterPartTypeEnum.SUBSCRIBER,
                field: 'firstName',
                value: 'test value',
                operator: 'EQUAL',
              },
            ],
          },
        ],
      },
    ],
  };

  const testTemplate = (await session.testAgent.post(`/v1/notification-templates`).send(testTemplateRequestDto)).body
    .data;

  process.env.BLUEPRINT_CREATOR = session.organization._id;

  const testEnvBlueprintTemplate = (
    await session.testAgent.post(`/v1/notification-templates`).send(testTemplateRequestDto)
  ).body.data;

  expect(testEnvBlueprintTemplate).to.be.ok;

  await session.applyChanges({
    enabled: false,
  });

  if (!prodEnv) throw new Error('production environment was not found');

  const blueprintId = (
    await notificationTemplateRepository.findOne({
      _environmentId: prodEnv._id,
      _parentId: testEnvBlueprintTemplate._id,
    })
  )?._id;

  if (!blueprintId) throw new Error('blueprintId was not found');

  const blueprint = (await session.testAgent.get(`/v1/blueprints/${blueprintId}`).send()).body.data;

  blueprint.notificationGroupId = blueprint._notificationGroupId;
  blueprint.blueprintId = blueprint._id;

  const createdTemplate = (await session.testAgent.post(`/v1/notification-templates`).send({ ...blueprint })).body.data;

  return {
    testTemplateRequestDto,
    testTemplate,
    blueprintId,
    createdTemplate,
  };
}
