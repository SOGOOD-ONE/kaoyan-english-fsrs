import type {Card,ReviewLog,Rating} from "ts-fsrs";
export type Word={id?:string;word:string;meaning:string;example?:string;tags?:string[];hfCount?:number;examYears?:number[];type?:string;category?:string};
export type StoredCard={wordId:string;card:Card};
export type StoredReview={id:string;wordId:string;reviewedAt:number;rating:Rating;log:ReviewLog};