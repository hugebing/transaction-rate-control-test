package chaincode

import (
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"strconv"
	"strings"
	"fmt"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

const ERROR_UNKNOWN_FUNC = "Unknown function"
const ERROR_WRONG_ARGS = "Wrong arguments of function"
const ERROR_SYSTEM = "System exception"
const ERR_NOT_FOUND = "Could not find specified account"
const ERROR_PUT_STATE = "Failed to put state"

var namespace = hexdigest("smallbank")[:6]

type SmallbankChaincode struct {
	contractapi.Contract
}

func (t *SmallbankChaincode) Init(ctx contractapi.TransactionContextInterface) error {
	// nothing to do
	return nil
}

type Account struct {
	CustomId        string
	CustomName      string
	SavingsBalance  int
	CheckingBalance int
}

func (t *SmallbankChaincode) CreateAccount(ctx contractapi.TransactionContextInterface,
	args []string) error {
	if len(args) != 4 {
		return errormsg(ERROR_WRONG_ARGS + " create_account")
	}

	checking, errcheck := strconv.Atoi(args[2])
	if errcheck != nil {
		return errormsg(ERROR_WRONG_ARGS)
	}
	saving, errsaving := strconv.Atoi(args[3])
	if errsaving != nil {
		return errormsg(ERROR_WRONG_ARGS)
	}

	account := &Account{
		CustomId:        args[0],
		CustomName:      args[1],
		SavingsBalance:  saving,
		CheckingBalance: checking}
	err := saveAccount(ctx, account)
	if err != nil {
		return systemerror(err.Error())
	}

	return nil
}

func (t *SmallbankChaincode) DepositChecking(ctx contractapi.TransactionContextInterface, args []string) error {
	if len(args) != 2 {
		return errormsg(ERROR_WRONG_ARGS + " deposit_checking")
	}
	account, err := loadAccount(ctx, args[1])
	if err != nil {
		return errormsg(ERR_NOT_FOUND + " " + args[1])
	}
	amount, _ := strconv.Atoi(args[0])
	account.CheckingBalance += amount
	err = saveAccount(ctx, account)
	if err != nil {
		return systemerror(err.Error())
	}

	return nil
}

func (t *SmallbankChaincode) WriteCheck(ctx contractapi.TransactionContextInterface, args []string) error {
	if len(args) != 2 {
		return errormsg(ERROR_WRONG_ARGS + " write_check")
	}
	account, err := loadAccount(ctx, args[1])
	if err != nil {
		return errormsg(ERR_NOT_FOUND + " " + args[1])
	}
	amount, _ := strconv.Atoi(args[0])
	account.CheckingBalance -= amount
	err = saveAccount(ctx, account)
	if err != nil {
		return systemerror(err.Error())
	}

	return nil
}

func (t *SmallbankChaincode) TransactSavings(ctx contractapi.TransactionContextInterface, args []string) error {
	if len(args) != 2 { // should be [amount,customer_id]
		return errormsg(ERROR_WRONG_ARGS + " transaction_savings")
	}
	account, err := loadAccount(ctx, args[1])
	if err != nil {
		return errormsg(ERR_NOT_FOUND + " " + args[1])
	}
	amount, _ := strconv.Atoi(args[0])

	account.SavingsBalance += amount
	err = saveAccount(ctx, account)
	if err != nil {
		return systemerror(err.Error())
	}

	return nil
}

func (t *SmallbankChaincode) SendPayment(ctx contractapi.TransactionContextInterface, args []string) error {
	if len(args) != 3 {
		return errormsg(ERROR_WRONG_ARGS + " send_payment")
	}
	destAccount, err1 := loadAccount(ctx, args[1])
	sourceAccount, err2 := loadAccount(ctx, args[2])
	if err1 != nil {
		return errormsg(ERR_NOT_FOUND + " " + args[1])
	}

	if err2 != nil {
		return errormsg(ERR_NOT_FOUND + " " + args[2])
	}

	amount, _ := strconv.Atoi(args[0])
	sourceAccount.CheckingBalance -= amount
	destAccount.CheckingBalance += amount
	err1 = saveAccount(ctx, sourceAccount)
	err2 = saveAccount(ctx, destAccount)
	if err1 != nil || err2 != nil {
		return errormsg(ERROR_PUT_STATE)
	}

	return nil
}

func (t *SmallbankChaincode) Amalgamate(ctx contractapi.TransactionContextInterface, args []string) error {
	if len(args) != 2 {
		return errormsg(ERROR_WRONG_ARGS + " amalgamate")
	}
	destAccount, err1 := loadAccount(ctx, args[0])
	sourceAccount, err2 := loadAccount(ctx, args[1])
	if err1 != nil {
		return errormsg(ERR_NOT_FOUND + " " + args[0])
	}

	if err2 != nil {
		return errormsg(ERR_NOT_FOUND + " " + args[1])
	}

	destAccount.CheckingBalance += sourceAccount.SavingsBalance
	sourceAccount.SavingsBalance = 0
	err1 = saveAccount(ctx, sourceAccount)
	err2 = saveAccount(ctx, destAccount)
	if err1 != nil || err2 != nil {
		return errormsg(ERROR_PUT_STATE)
	}

	return nil
}

func (t *SmallbankChaincode) Query(ctx contractapi.TransactionContextInterface, args []string) (*Account , error) {
	key := accountKey(args[0])
	accountBytes, err := ctx.GetStub().GetState(key)
	if err != nil {
		return nil, systemerror(err.Error())
	}
	res := Account{}
	err = json.Unmarshal(accountBytes, &res)

	return &res, nil
}

func errormsg(msg string) error {
	return fmt.Errorf("{\"error\":" + msg + "}")
}

func systemerror(err string) error {
	return errormsg(ERROR_SYSTEM + ":" + err)
}

func hexdigest(str string) string {
	hash := sha512.New()
	hash.Write([]byte(str))
	hashBytes := hash.Sum(nil)
	return strings.ToLower(hex.EncodeToString(hashBytes))
}

func accountKey(id string) string {
	// return namespace + hexdigest(id)[:64]
	return namespace + id
}

func loadAccount(ctx contractapi.TransactionContextInterface, id string) (*Account, error) {
	key := accountKey(id)
	accountBytes, err := ctx.GetStub().GetState(key)
	if err != nil {
		return nil, err
	}
	res := Account{}
	err = json.Unmarshal(accountBytes, &res)
	if err != nil {
		return nil, err
	}
	return &res, nil
}

func saveAccount(ctx contractapi.TransactionContextInterface, account *Account) error {
	accountBytes, err := json.Marshal(account)
	if err != nil {
		return err
	}
	key := accountKey(account.CustomId)
	return ctx.GetStub().PutState(key, accountBytes)
}