# Mazzaroth-it

[![CircleCI](https://circleci.com/gh/kochavalabs/mazzaroth-it.svg?style=svg)](https://circleci.com/gh/kochavalabs/mazzaroth-it)

Although some of a contract's logic can be tested using standard rust unit tests,
integration tests are necessary for testing host functions and other higher
level logic. Mazzaroth-it is a relatively straight forward node script that
helps by automating some of the repetative tasks related with running
integration tests.

## Intoduction

Mazzaroth-it allows you to specify a series of test sets that can be run on a
freshly spun up standalone node. For each test set mazzaroth-it will handle
starting the node, initializing the network configuration and running the
initial contract deploy. Next it will send a series of transactions based upon
what you configure and allow you to assert what the results should be. In order
to run mazzaroth-it you will need to have the latest version of docker
installed, the standalone node will be run in a docker instance.

## Sample

The configuration used to run mazzaroth-it is a simple json file:

```json


```
