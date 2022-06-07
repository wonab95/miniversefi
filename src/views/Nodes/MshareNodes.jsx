import {Grid} from '@material-ui/core';
import React from 'react';
import {Route, Switch, useRouteMatch} from 'react-router-dom';
import Page from '../../components/Page';
import GrapeNode from '../MshareNode';
import GrapeCard from './MshareCard';
import PitImage from '../../assets/img/background.png';
import { createGlobalStyle } from 'styled-components';
const BackgroundImage = createGlobalStyle`
  body {
    background: url(${PitImage}) no-repeat !important;
    background-size: cover !important;
  }
`;

const GrapeNodes = () => {
  const {path} = useRouteMatch();
  return (
    <Page>
      <BackgroundImage />
      <Switch>
        <Route exact path={path}>
          <h2 style={{fontSize: '80px', textAlign: 'center'}}>NODES</h2>
          <Grid container spacing={3} style={{marginTop: '20px'}}>
            <GrapeCard />
          </Grid>
        </Route>
        <Route path={`${path}/:bankId`}>
          <GrapeNode />
        </Route>
      </Switch>
    </Page>
  );
};

export default GrapeNodes;
