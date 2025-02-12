// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/src/Test.sol";

import {einput, euint64} from "fhevm/lib/TFHE.sol";

import {FhevmDebug} from "forge-fhevm/src/FhevmDebug.sol";
import {FFhevm} from "forge-fhevm/src/FFhevm.sol";

import {Signers} from "../Signers.sol";
import {MyConfidentialERC20} from "../../../contracts/MyConfidentialERC20.sol";

// solhint-disable func-name-mixedcase
contract MyConfidentialERC20Test is Test {
    Signers signers;
    MyConfidentialERC20 erc20;

    function setUp() public {
        FFhevm.setUp();

        signers = new Signers();
        signers.setUpWallets();

        vm.deal(signers.aliceAddr(), 1000 ether);
        vm.deal(signers.bobAddr(), 1000 ether);
        vm.deal(signers.carolAddr(), 1000 ether);

        vm.broadcast(signers.alice());
        erc20 = new MyConfidentialERC20("Naraggara", "NARA");

        vm.assertEq(FFhevm.getConfig().core.ACLAddress, 0xFee8407e2f5e3Ee68ad77cAE98c434e637f516e5);
    }

    function test_should_mint_contract() public {
        address aliceAddr = signers.aliceAddr();

        vm.assertEq(erc20.owner(), aliceAddr);

        vm.broadcast(signers.alice());
        erc20.mint(aliceAddr, 1000);

        euint64 balanceHandle = erc20.balanceOf(aliceAddr);
        uint64 balance = FhevmDebug.decryptU64(balanceHandle, address(erc20), aliceAddr);
        vm.assertEq(balance, 1000);

        uint64 totalSupply = erc20.totalSupply();
        vm.assertEq(totalSupply, 1000);
    }

    function test_should_transfer_tokens_between_two_users() public {
        address aliceAddr = signers.aliceAddr();
        address bobAddr = signers.bobAddr();

        vm.assertEq(erc20.owner(), aliceAddr);

        vm.broadcast(signers.alice());
        erc20.mint(aliceAddr, 10000);

        euint64 balanceHandleAlice = erc20.balanceOf(aliceAddr);
        FhevmDebug.assertArithmeticallyValid(balanceHandleAlice);

        (einput inputHandle, bytes memory inputProof) = FFhevm.encryptU64(1337, address(erc20), aliceAddr);

        vm.broadcast(signers.alice());
        erc20.transfer(bobAddr, inputHandle, inputProof);

        // Decrypt Alice's balance
        balanceHandleAlice = erc20.balanceOf(aliceAddr);
        FhevmDebug.assertArithmeticallyValid(balanceHandleAlice);

        uint64 balanceAlice = FhevmDebug.decryptU64(balanceHandleAlice, address(erc20), aliceAddr);
        vm.assertEq(balanceAlice, 10000 - 1337);

        // Decrypt Bob's balance
        euint64 balanceHandleBob = erc20.balanceOf(bobAddr);
        uint64 balanceBob = FhevmDebug.decryptU64(balanceHandleBob, address(erc20), bobAddr);
        vm.assertEq(balanceBob, 1337);
    }

    function test_should_not_transfer_tokens_between_two_users() public {
        address aliceAddr = signers.aliceAddr();
        address bobAddr = signers.bobAddr();

        vm.assertEq(erc20.owner(), aliceAddr);

        vm.broadcast(signers.alice());
        erc20.mint(aliceAddr, 1000);

        (einput inputHandle, bytes memory inputProof) = FFhevm.encryptU64(1337, address(erc20), aliceAddr);

        vm.broadcast(signers.alice());
        erc20.transfer(bobAddr, inputHandle, inputProof);

        // Decrypt Alice's balance
        euint64 balanceHandleAlice = erc20.balanceOf(aliceAddr);
        uint64 balanceAlice = FhevmDebug.decryptU64(balanceHandleAlice, address(erc20), aliceAddr);
        vm.assertEq(balanceAlice, 1000);

        // Decrypt Bob's balance
        euint64 balanceHandleBob = erc20.balanceOf(bobAddr);
        uint64 balanceBob = FhevmDebug.decryptU64(balanceHandleBob, address(erc20), bobAddr);
        vm.assertEq(balanceBob, 0);
    }

    function reencryptU64(euint64 handle, address contractAddress, uint256 userPk, address userAddress)
        private
        returns (uint64 clearValue)
    {
        (bytes memory publicKey, bytes memory privateKey) = FFhevm.generateKeyPair();
        bytes32 eip712 = FFhevm.createEIP712Digest(publicKey, contractAddress);
        bytes memory signature = FFhevm.sign(eip712, userPk);
        clearValue = FFhevm.reencryptU64(handle, privateKey, publicKey, signature, contractAddress, userAddress);
    }

    function test_should_be_able_to_transferFrom_only_if_allowance_is_sufficient() public {
        address aliceAddr = signers.aliceAddr();
        address bobAddr = signers.bobAddr();

        vm.assertEq(erc20.owner(), aliceAddr);

        vm.broadcast(signers.alice());
        erc20.mint(aliceAddr, 10000);

        bytes memory proof;
        einput encAmount;

        // Alice approves Bob, amount: 1337
        (encAmount, proof) = FFhevm.encryptU64(1337, address(erc20), aliceAddr);

        vm.broadcast(signers.alice());
        erc20.approve(bobAddr, encAmount, proof);

        // Bob transfers from Alice, amount: 1338
        (encAmount, proof) = FFhevm.encryptU64(1338, address(erc20), bobAddr);

        vm.broadcast(signers.bob());
        erc20.transferFrom(aliceAddr, bobAddr, encAmount, proof);

        // Decrypt Alice's balance
        euint64 balanceHandleAlice = erc20.balanceOf(aliceAddr);
        uint64 balanceAlice = FhevmDebug.decryptU64(balanceHandleAlice, address(erc20), aliceAddr);
        // check that transfer did not happen, as expected
        vm.assertEq(balanceAlice, 10000);

        // Decrypt Bob's balance
        euint64 balanceHandleBob = erc20.balanceOf(bobAddr);
        uint64 balanceBob = FhevmDebug.decryptU64(balanceHandleBob, address(erc20), bobAddr);
        // check that transfer did not happen, as expected
        vm.assertEq(balanceBob, 0);

        // Bob transfers from Alice, amount: 1337
        (encAmount, proof) = FFhevm.encryptU64(1337, address(erc20), bobAddr);

        vm.broadcast(signers.bob());
        erc20.transferFrom(aliceAddr, bobAddr, encAmount, proof);

        // Decrypt Alice's balance
        balanceHandleAlice = erc20.balanceOf(aliceAddr);
        balanceAlice = FhevmDebug.decryptU64(balanceHandleAlice, address(erc20), aliceAddr);
        // check that transfer did actually happen, as expected
        vm.assertEq(balanceAlice, 10000 - 1337);

        // Decrypt Bob's balance
        balanceHandleBob = erc20.balanceOf(bobAddr);
        balanceBob = FhevmDebug.decryptU64(balanceHandleBob, address(erc20), bobAddr);
        // check that transfer did actually happen, as expected
        vm.assertEq(balanceBob, 1337);

        balanceBob = reencryptU64(balanceHandleBob, address(erc20), signers.bob(), bobAddr);
        vm.assertEq(balanceBob, 1337);
    }
}
