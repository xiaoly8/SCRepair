/**
 * @author: Xiao Liang Yu <xiaoly@comp.nus.edu.sg>
 * 
 */


import { Mutation, FaultSpaceUpdate } from ".";

export default abstract class RandomMutationGenerator<MutationType extends Mutation> implements IterableIterator<MutationType | undefined> {

    protected constructor() {

    }

    public abstract next(value: any): IteratorResult<MutationType | undefined>;

    [Symbol.iterator](): IterableIterator<MutationType | undefined> {
        return this;
    }

    public abstract updateFaultSpace(faultSpaceUpdateObj: FaultSpaceUpdate): boolean;

    public abstract isMutationInRemainingSpace(mutation: MutationType): boolean;

    public abstract numMutationRemaining(): number;
    
}
