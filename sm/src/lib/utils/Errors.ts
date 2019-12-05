/**
 * @author: Xiao Liang Yu <xiaoly@comp.nus.edu.sg>
 * 
 */


class UnimplementedError extends Error {
    public constructor(msg?: string) {
        super(msg);
    }
}

class ValueError extends Error {
    public constructor(msg?: string) {
        super(msg);
    }
}