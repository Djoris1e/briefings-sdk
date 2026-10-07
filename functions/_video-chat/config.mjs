import projectConfig from '../../briefing.config.ts';
import { defineBriefingConfig } from '../../src/briefing/config.ts';

/** Host configuration only; no fields are read from an incoming HTTP body. */
export function providerConfig(env = {}) {
  const base = env.BRIEFING_CONFIG ? defineBriefingConfig(env.BRIEFING_CONFIG) : projectConfig;
  return defineBriefingConfig({
    ...base,
    planner: { ...base.planner, ...(env.BRIEFING_PLANNER_MODEL ? { model: env.BRIEFING_PLANNER_MODEL } : {}) },
    speech: { ...base.speech,
      ...(env.BRIEFING_NARRATOR_VOICE ? { narrator: env.BRIEFING_NARRATOR_VOICE } : {}),
      ...(env.BRIEFING_HOST_VOICE ? { host: env.BRIEFING_HOST_VOICE } : {}),
      ...(env.BRIEFING_ANALYST_VOICE ? { analyst: env.BRIEFING_ANALYST_VOICE } : {}),
      ...(env.BRIEFING_LANGUAGE ? { language: env.BRIEFING_LANGUAGE } : {}),
    },
    video: { ...base.video, ...(env.BRIEFING_ANIMATE_SCREENSHOTS === undefined ? {} : { animateScreenshots: env.BRIEFING_ANIMATE_SCREENSHOTS === 'true' }) },
  });
}
