import { fsrs } from "ts-fsrs";
export const FSRS_CONFIG={request_retention:0.9,maximum_interval:36500,enable_fuzz:true,enable_short_term:true,learning_steps:["1m","10m"],relearning_steps:["10m"]} as const;
export const scheduler=fsrs(FSRS_CONFIG);