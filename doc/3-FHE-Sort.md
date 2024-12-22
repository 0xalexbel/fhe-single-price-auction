Prev: [FHE Precomputations](./2-FHE-Precomputations.md)\
Next: [FHE Auction](./4-FHE-Auction.md)

# FHE Sort

1. [Rank Vector $\mathbf{rank}$](#1-rank-vector)
2. [Rank Matrix $\mathbf{R_{eq}}$](#2-rank-matrix)
3. [Quantity Vector $\mathbf{q_{rank}}$](#3-quantity-vector)
4. [Price Vector $\mathbf{p_{rank}}$](#4-price-vector)

## 1. Rank Vector $\mathbf{rank}$

### 1.1. Definition

Let $\mathbf{rank} = (\mathbf{rank}[i])_{1 \le i \le N}$ denote the vector whose entries $\mathbf{rank}[i]$ are defined as:

```math
\forall i, k \in \{1, 2, 3, \dots, N\}, \quad \mathbf{rank}[i] = \text{rank}(i)
```

### 1.2. FHE Cost 

|                         | fheAdd(U16) | FHE units
| :---:                   | :---:       | :---:
| $\mathbf{rank}[i]$      | $N-1$       | $5(N-1)$ 
| $\mathbf{rank}$         | $N(N-1)$    | $5N(N-1)$ 


### 1.3. Solidity sample code

```js
function Bgt(uint16 bi, uint16 bj) returns(ebool);

function rankAt(uint16 i) returns(euint16 rank) {
    rank = TFHE.asEuint16(0);
    for(uint16 j = 0; j < N; ++j) {
        if (i != j) {
            rank = TFHE.add(r, TFHE.asEuint16(Bgt(j,i)));
        }
    }
}
```

## 2. Rank Matrix $\mathbf{R_{eq}}$

### 2.1 Definition

Let $\mathbf{R_{eq}} = (\mathbf{R_{eq}}[i, k])_{1 \le i, k \le N}$ denote the matrix whose entries $\mathbf{R_{eq}}[i, k]$ are defined as:

```math
\forall i, k \in \{1, 2, 3, \dots, N\}, \quad \mathbf{R_{eq}}[i, k] = 
\begin{cases}
1, & \text{if } \ \mathbf{rank}[i] = k - 1, \\
0, & \text{otherwise}.
\end{cases}
```

### 2.2. FHE Cost 

|                         | fheEq(U16) | FHE units
| :---:                   | :---:      | :---:
| $\mathbf{R_{eq}}[i,k]$  | $1$        | $2$ 
| $\mathbf{R_{eq}}$       | $N^2$      | $2N^2$ 


## 3. Quantity Vector $\mathbf{q_{rank}}$

### 3.1. Definition

Let $\mathbf{q_{rank}} = (\mathbf{q_{rank}}[k])_{1 \le k \le N}$ denote the vector where the $k$-th entry represents the total quantity of tokens bid by all the bidders ranked at the $k$-th position upon completion of the auction.

The entries of $\mathbf{q_{rank}}$ are defined as follows:

```math
\begin{gather}
\forall k \in \{1, 2, \dots, N\}, \quad \mathbf{q_{rank}}[k] = \sum_{\substack{i \in \{1, 2, \dots, N\}}} \mathbf{R_{eq}}[i, k] . q_i
\end{gather}
```

#### Case with Unique Rankings:

When $>$ produces a set of bidders with unique rankings (i.e. no ties), the rank function $\text{rank}(i)$ becomes bijective. In this case the vector $\mathbf{q_{rank}}$ can be expressed using bitwise operations resulting in a more efficient formula in terms of FHE cost:

```math
\begin{gather}
\forall k \in \{1, 2, \dots, N\}, \quad \mathbf{q_{rank}}[k] = \bigvee_{\substack{i \in \{1, 2, \dots, N\}}} \mathbf{R_{eq}}[i, k] \land q_i
\end{gather}
```

### 3.2. FHE Cost 

|        | fheAnd(U256) | fheOr(U256) | fheAdd(U256) | fheIfThenElse(U256) | FHE units
| :---   | :---:        | :---:       | :---:        | :---:               | :---:     
| $\mathbf{q_{rank}}[k]$ (unique rankings) | $N$    | $N-1$    | $0$      | $0$   | $4N-2$ 
| $\mathbf{q_{rank}}$ (unique rankings)    | $N^2$  | $N(N-1)$ | $0$      | $0$   | $4N(N-2)$
| $\mathbf{q_{rank}}[k]$ (with ties)       | $0$    | $0$      | $N-1$    | $N$   | $14N-10$ 
| $\mathbf{q_{rank}}$ (with ties)          | $0$    | $0$      | $N(N-1)$ | $N^2$ | $N(14N-10)$


### 3.3. Solidity sample code

```js
function Req(uint16 bi, uint16 k) returns(ebool);
function quantity(uint16 bi) returns (euint256);

// If bidders can have identical rankings (i.e., ties exist)
function qRankWithTies(uint16 k) returns(euint256 qRank) {
    qRank = TFHE.ifThenElse(Req(0,k), quantity(0), TFHE.asEuint256(0));
    for(uint16 i = 1; i < N; ++i) {
        euint256 q = TFHE.ifThenElse(Req(i,k), quantity(i), TFHE.asEuint256(0));
        qRank = TFHE.add(qRank, q);
    }
}
```

```js
// returns 0 or 2^256-1
function Req(uint16 bi, uint16 k) returns(euint256);
function quantity(uint16 bi) returns (euint256);

// If bidders have unique rankings (i.e., there are no ties)
function qRankUnique(uint16 k) returns(euint256 qRank) {
    qRank = TFHE.and(Req(0,k), quantity(0));
    for(uint16 i = 1; i < N; ++i) {
        euint256 q = TFHE.and(Req(i,k), q(i));
        qRank = TFHE.or(qRank, q);
    }
}    
```

## 4. Price Vector $\mathbf{p_{rank}}$

### 4.1. Definition

Let $\mathbf{p_{rank}} = (\mathbf{p_{rank}}[k])_{1 \le k \le N}$ denote the vector whose $k$-th entry represents the common token unit price bid by each of $k$-th highest-ranked bidders upon completion of the auction.

The entries of $\mathbf{p_{rank}}$ are defined as follows:

```math
\forall k \in \{1, 2, \dots, N\}, \quad \mathbf{p_{rank}}[k] = \bigvee_{\substack{i \in \{1, 2, \dots, N\}}} \mathbf{R_{eq}}[i, k] \land p_i
```

### 4.2. FHE Cost 

|        | fheAnd(U256) | fheOr(U256) | fheIfThenElse(U256) | FHE units
| :---   | :---:        | :---:       | :---:               | :---:     
| $\mathbf{p_{rank}}[k]$ (bitwise)      | $N$    | $N-1$    | $0$   | $4N-2$ 
| $\mathbf{p_{rank}}$ (bitwise)         | $N^2$  | $N(N-1)$ | $0$   | $4N(N-2)$
| $\mathbf{p_{rank}}[k]$ (if/then/else) | $0$    | $0$      | $N$   | $4N$ 
| $\mathbf{p_{rank}}$ (if/then/else)    | $0$    | $0$      | $N^2$ | $4N^2$

### 4.3. Solidity sample code

```js
function Req(uint16 bi, uint16 k) returns(ebool);
function price(uint16 bi) returns (euint256);

function pRank(uint16 k) returns(euint256) {
    euint256 p = TFHE.ifThenElse(Req(0,k), price(0), TFHE.asEuint256(0));
    for(uint16 i = 1; i < N; ++i) {
        p = TFHE.ifThenElse(Req(i,k), price(i), p);
    }
    return p;
}
```

```js
// returns 0 or 2^256-1
function Req(uint16 bi, uint16 k) returns(euint256);
function price(uint16 bi) returns (euint256);

function pRank(uint16 k) returns(euint256 p) {
    euint256 p = TFHE.and(Req(0,k), price(0));
    for(uint16 i = 1; i < N; ++i) {
        euint256 _p = TFHE.and(Req(i,k), q(i));
        p = TFHE.or(p, _p);
    }
    return p;
}    
```

<br>

------

<br>

Prev: [FHE Precomputations](./2-FHE-Precomputations.md)\
Next: [FHE Auction](./4-FHE-Auction.md)
