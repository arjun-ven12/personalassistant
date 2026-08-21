import {
  AgentSocietyDashboardResponseSchema,
  CollaborationEdgeRecordSchema,
  CommunicationRecordSchema,
  DebateRecordSchema,
  DelegationRecordSchema,
  MeetingRecordSchema,
  MentorshipRecordSchema,
  OrganizationalMetricRecordSchema,
  PeerReviewRecordSchema,
  ReputationScoreRecordSchema,
  SocietyDebateResponseSchema,
  SocietyMeetingResponseSchema,
  SocietyTeamFormationResponseSchema,
  TeamRecordSchema,
} from "@alexa-control/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ApiRouteContext } from "./context.js";

const LimitQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(500).default(200) })
  .strict();

export const registerAgentSocietyRoutes = (
  app: FastifyInstance,
  context: ApiRouteContext,
) => {
  app.get(
    "/api/agent-society/dashboard",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return AgentSocietyDashboardResponseSchema.parse(
        await context.agentSociety.dashboard(identity.user.id),
      );
    },
  );

  app.post(
    "/api/agent-society/teams",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return SocietyTeamFormationResponseSchema.parse(
        await context.agentSociety.formTeam({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/agent-society/debates",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return SocietyDebateResponseSchema.parse(
        await context.agentSociety.startDebate({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.post(
    "/api/agent-society/meetings",
    {
      preHandler: [
        context.security.requireAuthentication,
        context.security.requireTrustedOrigin,
        context.security.requireCsrf,
      ],
    },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return SocietyMeetingResponseSchema.parse(
        await context.agentSociety.recordMeeting({
          ownerId: identity.user.id,
          body: request.body,
          requestId: request.id,
          ipAddress: request.ip,
        }),
      );
    },
  );

  app.get(
    "/api/agent-society/teams",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = LimitQuerySchema.parse(request.query);
      return z
        .array(TeamRecordSchema)
        .parse(
          await context.agentSociety.store.listTeams(identity.user.id, query.limit),
        );
    },
  );

  app.get(
    "/api/agent-society/debates",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = LimitQuerySchema.parse(request.query);
      return z
        .array(DebateRecordSchema)
        .parse(
          await context.agentSociety.store.listDebates(identity.user.id, query.limit),
        );
    },
  );

  app.get(
    "/api/agent-society/meetings",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = LimitQuerySchema.parse(request.query);
      return z
        .array(MeetingRecordSchema)
        .parse(
          await context.agentSociety.store.listMeetings(identity.user.id, query.limit),
        );
    },
  );

  app.get(
    "/api/agent-society/reputation",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return z
        .array(ReputationScoreRecordSchema)
        .parse(await context.agentSociety.store.listReputation(identity.user.id));
    },
  );

  app.get(
    "/api/agent-society/collaboration",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      return z
        .array(CollaborationEdgeRecordSchema)
        .parse(
          await context.agentSociety.store.listCollaborationEdges(identity.user.id),
        );
    },
  );

  app.get(
    "/api/agent-society/analytics",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = LimitQuerySchema.parse(request.query);
      return z
        .array(OrganizationalMetricRecordSchema)
        .parse(
          await context.agentSociety.store.listMetrics(identity.user.id, query.limit),
        );
    },
  );

  app.get(
    "/api/agent-society/communications",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = LimitQuerySchema.parse(request.query);
      return z
        .array(CommunicationRecordSchema)
        .parse(
          await context.agentSociety.store.listCommunications(
            identity.user.id,
            query.limit,
          ),
        );
    },
  );

  app.get(
    "/api/agent-society/delegations",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = LimitQuerySchema.parse(request.query);
      return z
        .array(DelegationRecordSchema)
        .parse(
          await context.agentSociety.store.listDelegations(
            identity.user.id,
            query.limit,
          ),
        );
    },
  );

  app.get(
    "/api/agent-society/peer-reviews",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = LimitQuerySchema.parse(request.query);
      return z
        .array(PeerReviewRecordSchema)
        .parse(
          await context.agentSociety.store.listPeerReviews(
            identity.user.id,
            query.limit,
          ),
        );
    },
  );

  app.get(
    "/api/agent-society/mentorships",
    { preHandler: [context.security.requireAuthentication] },
    async (request) => {
      const identity = context.security.getIdentity(request);
      const query = LimitQuerySchema.parse(request.query);
      return z
        .array(MentorshipRecordSchema)
        .parse(
          await context.agentSociety.store.listMentorships(
            identity.user.id,
            query.limit,
          ),
        );
    },
  );
};
